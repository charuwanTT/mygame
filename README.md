# 🤖 RAG Chatbot with LINE Integration on macOS

- ใช้โมเดล `llama3:latest` จาก Ollama (Local LLM)
- ดึงข้อมูลจาก Markdown/PDF (RAG)
- รองรับภาษาไทยและอังกฤษ
- ตอบกลับผ่าน LINE Messaging API
- เขียนด้วย FastAPI ใช้งานได้บน macOS


---
## การสร้าง Project 
### 1. สร้าง Folder Project ไว้ที่สะดวก โดยมีโครงสร้างใน Visual studio Code ดังนี้
-  chatbot-project/
    ├── appsmez                     # ข้อมูลบริษัท
    ├── fooddee                     # ข้อมูลบริษัท
    ├── scspark                     # ข้อมูลบริษัท
    ├── app.py                      # FastAPI main server
    ├── ollama_client.py            # เชื่อมต่อกับ Ollama และเรียกใช้โมเดล llama3
    ├── RAG_pipeline.py             # ระบบค้นหาและสกัดข้อมูล (RAG)
    ├── embedder.py                 # โมดูลสำหรับฝังข้อมูล (embedding)
    ├── requirements.txt            # รายการ dependencies
    ├── static/
    │   └── script.js               # JavaScript สำหรับ UI
    ├── templates/
        └── index.html              # HTML Template หลัก
    ├── .env  
### 2. ข้อมูลของบริษัท
-  https://drive.google.com/drive/u/1/folders/1yBW0ueM-o9sXi4EGdyuPirJ8_4SFCC4F?usp=sharing

### 3. สร้าง Virtual Environment และติดตั้งไลบรารี
```bash
python3 -m venv venv
source venv/bin/activate
```
### 4. ทำการนำ Code ไปใส่ในแต่ละ File 
-  Code สำหรับ **"requirements.txt"**
```annotated-types==0.7.0
anyio==4.9.0
certifi==2025.4.26
click==8.2.1
colorama==0.4.6
fastapi==0.115.12
h11==0.16.0
httpcore==1.0.9
httpx==0.28.1
idna==3.10
Jinja2==3.1.6
joblib==1.5.0
langdetect==1.0.9
MarkupSafe==3.0.2
numpy==2.2.6
ollama==0.4.8
pydantic==2.11.4
pydantic_core==2.33.2
python-multipart==0.0.20
scikit-learn==1.6.1
scipy==1.15.3
six==1.17.0
sniffio==1.3.1
starlette==0.46.2
threadpoolctl==3.6.0
typing-inspection==0.4.1
typing_extensions==4.13.2
uvicorn==0.34.2
line-bot-sdk
langchain
langchain-community
langchain-ollama
pandas
python-multipart
openpyxl
```
-  Code สำหรับ **" app.py "**
```bash
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage

import os, re, uuid, logging, csv
import hashlib, hmac, json

from fastapi import FastAPI, Request, Form, Header
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from langdetect import detect
from ollama import Client

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import pandas as pd
from openpyxl import Workbook

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("server.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)

# App setup
app = FastAPI()
templates = Jinja2Templates(directory="templates")
os.makedirs("exports", exist_ok=True)
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/exports", StaticFiles(directory="exports"), name="exports")
ollama_client = Client(host="http://localhost:11434")
session_chat_history = {}

# LINE setup
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)
handler = WebhookHandler(LINE_CHANNEL_SECRET)

CSV_LOG_FILE = "conversation_history.csv"

# ------------------------------ CSV Logging ------------------------------
def remove_emoji(text):
    emoji_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"
        u"\U0001F300-\U0001F5FF"
        u"\U0001F680-\U0001F6FF"
        u"\U0001F1E0-\U0001F1FF"
        u"\u2600-\u26FF"
        u"\u2700-\u27BF"
        "]+", flags=re.UNICODE)
    return emoji_pattern.sub(r'', str(text))

def log_to_csv(source, user_message, bot_reply):
    user_message = remove_emoji(user_message)
    bot_reply = remove_emoji(bot_reply)
    with open(CSV_LOG_FILE, mode='a', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        writer.writerow([source, user_message, bot_reply])

# ------------------------------ Export to Excel ------------------------------
def export_conversation_to_excel():
    if not os.path.exists(CSV_LOG_FILE):
        return {"error": "CSV file not found"}

    df = pd.read_csv(CSV_LOG_FILE, names=["Source", "User Message", "Bot Reply"])
    df["User Message"] = df["User Message"].apply(remove_emoji)
    df["Bot Reply"] = df["Bot Reply"].apply(remove_emoji)

    file_path = "exports/conversation_export.xlsx"

    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="All_Conversations")
        df.tail(50).to_excel(writer, index=False, sheet_name="Recent_50")
        df[df["Source"] == "line"].to_excel(writer, index=False, sheet_name="Source_line")
        df[df["Source"] == "web"].to_excel(writer, index=False, sheet_name="Source_web")
        for lang in ["th", "en"]:
            filtered = df[df["User Message"].apply(lambda x: detect(x) == lang)]
            if not filtered.empty:
                filtered.to_excel(writer, index=False, sheet_name=f"Language_{lang}")

    return {"message": f"Exported to Excel: {file_path}"}

# ------------------------------ Markdown Knowledge Base ------------------------------
def load_markdown_knowledge():
    md_directories = ["appsmez", "fooddee", "scspark"]
    combined_text = ""
    for md_dir in md_directories:
        if os.path.exists(md_dir):
            for root, _, files in os.walk(md_dir):
                for filename in files:
                    if filename.endswith(".md"):
                        filepath = os.path.join(root, filename)
                        try:
                            with open(filepath, encoding="utf-8") as f:
                                combined_text += f"\n{f.read()}\n"
                        except Exception as e:
                            logging.error(f"Error loading {filepath}: {e}")
    return combined_text.strip() if combined_text else "ไม่พบข้อมูลในระบบ"

def extract_markdown_sections(text):
    pattern = r"^#+\s.+"
    lines = text.split('\n')
    sections, current_section = [], []
    for line in lines:
        if re.match(pattern, line):
            if current_section:
                sections.append('\n'.join(current_section).strip())
            current_section = [line]
        else:
            current_section.append(line)
    if current_section:
        sections.append('\n'.join(current_section).strip())
    return [s for s in sections if len(s.split('\n')) > 1]

knowledge_context = load_markdown_knowledge()
knowledge_chunks = extract_markdown_sections(knowledge_context)
vectorizer = TfidfVectorizer().fit(knowledge_chunks)
knowledge_vectors = vectorizer.transform(knowledge_chunks)

def retrieve_relevant_chunks(question, top_k=5):
    if knowledge_context == "ไม่พบข้อมูลในระบบ":
        return ""
    question_vec = vectorizer.transform([question])
    similarities = cosine_similarity(question_vec, knowledge_vectors).flatten()
    top_indices = similarities.argsort()[-top_k:][::-1]
    return "\n\n".join(
        knowledge_chunks[i].strip()
        for i in top_indices if similarities[i] > 0
    )

def build_prompts(message, relevant_context, user_lang):
    language_instruction = "กรุณาตอบเป็นภาษาไทย" if user_lang == "th" else "Please answer in English"
    system_content = f"""
คุณคือแชทบอทของบริษัท ที่ตอบคำถามโดยอ้างอิงจากเอกสาร Markdown เท่านั้น ห้ามแต่งหรือเดาข้อมูล
หากไม่มีข้อมูล ให้ตอบว่า \"ไม่พบข้อมูลตามที่ถาม\"
ให้ตอบกลับโดยใช้ภาษาของคำถาม (ไทยตอบไทย, อังกฤษตอบอังกฤษ)
ห้ามใช้คำว่า \"จากข้อความข้างต้น\" \"จากเอกสาร\" \"จากไฟล์\"
ให้ตอบโดยตรงเฉพาะเนื้อหาตาม Markdown จริง เช่น รายการบริการ รายละเอียด ฯลฯ
คำตอบต้อง:
- แสดงหัวข้อหลัก (เช่น `#`) ที่เกี่ยวข้อง
- แสดงหัวข้อย่อย (`##`, `###`) และเนื้อหาทั้งหมด
- ห้ามสรุป ห้ามตัดทอน
{language_instruction}
"""
    user_content = f"""
ต่อไปนี้คือข้อความจากเอกสาร Markdown ของบริษัท:

{relevant_context}

ผู้ใช้ถามว่า:
{message}

**กรุณาตอบโดยใช้ข้อมูลเฉพาะจากข้อความข้างต้นเท่านั้น**
- ให้ตอบโดยอ้างอิงเนื้อหา ไม่ใช่แค่ชื่อหัวข้อ
- ถ้าหัวข้อมีเนื้อหา ให้แสดงเนื้อหานั้น
- ห้ามตอบว่าไม่รู้ เว้นแต่ไม่มีเนื้อหาจริง ๆ
- ห้ามเติมข้อมูลที่ไม่มีในข้อความข้างต้น
"""
    return system_content, user_content

# ------------------------------ Endpoints ------------------------------
def save_to_csv(session_id, user_message, bot_reply, context="", question_type="", confidence=0.0):
    csv_file = "conversation_history.csv"
    file_exists = os.path.exists(csv_file)

    try:
        with open(csv_file, 'a', newline='', encoding='utf-8') as file:
            writer = csv.writer(file, quoting=csv.QUOTE_ALL)

            # เขียน header ถ้าไฟล์ใหม่
            if not file_exists:
                writer.writerow([
                    'timestamp',
                    'session_id',
                    'user_message',
                    'bot_reply',
                    'context',
                    'question_type',
                    'confidence',
                    'user_language'
                ])

            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([
                timestamp,
                session_id,
                user_message,
                bot_reply,
                context[:500],
                question_type,
                confidence,
                "th"
            ])
        logging.info("[CSV] Test data saved")
    except Exception as e:
        logging.error(f"[CSV] Error: {e}")

# ---------- ฟังก์ชันสร้าง Excel ----------
def save_to_excel():
    csv_file = "conversation_history.csv"
    excel_file = "conversation_history.xlsx"

    if not os.path.exists(csv_file):
        logging.warning("[Excel] CSV file not found")
        return False

    try:
        df = pd.read_csv(csv_file, encoding='utf-8')
        if df.empty:
            logging.warning("[Excel] CSV has no data")
            return False

        df['timestamp'] = pd.to_datetime(df['timestamp'])

        with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='All_Conversations', index=False)
            df.tail(50).to_excel(writer, sheet_name='Recent_50', index=False)

        logging.info("[Excel] Excel saved")
        return True
    except Exception as e:
        logging.error(f"[Excel] Error: {e}")
        return False

# ---------- ฟังก์ชันตรวจสอบและเพิ่มข้อมูลตัวอย่าง ----------
def ensure_test_data_exists():
    csv_file = "conversation_history.csv"
    if not os.path.exists(csv_file) or os.stat(csv_file).st_size < 100:
        logging.info("[Data] Adding test row...")
        save_to_csv(
            session_id="test_session",
            user_message="สวัสดี",
            bot_reply="ยินดีต้อนรับ",
            context="## แชทบอท\nยินดีช่วยเหลือ",
            question_type="rag",
            confidence=1.0
        )

# ---------- Startup Event ----------
@app.on_event("startup")
async def startup_event():
    logging.info("🚀 Starting server...")
    ensure_test_data_exists()
    if os.path.exists("conversation_history.csv"):
        logging.info("✅ Generating Excel from CSV...")
        success = save_to_excel()
        if success:
            logging.info("✅ Excel generated")
        else:
            logging.warning("⚠️ Excel generation failed")

# ---------- Endpoint: ดาวน์โหลด Excel ----------
@app.get("/download-excel")
async def download_excel():
    excel_file = "conversation_history.xlsx"

    if not os.path.exists(excel_file):
        logging.info("[Excel] Excel file not found, generating...")
        ensure_test_data_exists()
        success = save_to_excel()
        if not success:
            return JSONResponse(content={
                "error": "ไม่สามารถสร้างไฟล์ Excel ได้ เนื่องจากไม่มีข้อมูลสนทนาในระบบ กรุณาเริ่มต้นสนทนาเพื่อให้มีข้อมูลก่อน"
            }, status_code=404)

    try:
        with open(excel_file, 'rb') as file:
            content = file.read()

        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={excel_file}"}
        )
    except Exception as e:
        logging.error(f"[Excel] Download error: {e}")
        return JSONResponse(content={"error": "เกิดข้อผิดพลาดขณะอ่านไฟล์ Excel"}, status_code=500)

# ---------- Quick Test ----------
@app.get("/quick-test")
async def quick_test():
    return {"message": "Quick test successful"}

@app.get("/export-excel")
async def export_excel():
    """สร้างและดาวน์โหลด Excel ใน endpoint เดียว"""
    ensure_test_data_exists()
    success = save_to_excel()
    
    if not success:
        return JSONResponse(content={
            "error": "ไม่สามารถสร้างไฟล์ Excel ได้ เนื่องจากไม่มีข้อมูลในระบบ"
        }, status_code=500)

    try:
        with open("conversation_history.xlsx", "rb") as f:
            content = f.read()
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=conversation_history.xlsx"}
        )
    except Exception as e:
        logging.error(f"[Excel] Export error: {e}")
        return JSONResponse(content={"error": "เกิดข้อผิดพลาดระหว่างดาวน์โหลด"}, status_code=500)

```

-  Code สำหรับ **"ollama_client.py"**
```bash
import requests

class OllamaClient:
    def __init__(self, host="http://localhost:11434"):
        self.host = host

    def chat(self, model, messages):
        response = requests.post(
            f"{self.host}/api/chat",
            json={"model": model, "messages": messages}
        )
        return response.json()

ollama_client = OllamaClient()

```

-  Code สำหรับ **"RAG_pipeline.py"**
```bash
import os
import re
import requests
import logging
import json
from bs4 import BeautifulSoup
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain.chains import RetrievalQA
from langchain_community.chat_models import ChatOpenAI
from langchain.prompts import PromptTemplate

logging.basicConfig(level=logging.INFO)

# 🔹 ลิสต์เว็บไซต์ที่ต้องการดึงข้อมูล
URLS = [
    "https://appsmez.com/",
    "https://appsmez.com/compare",
    "https://appsmez.com/booking-app",
    "https://appsmez.com/shopping-app",
    "https://appsmez.com/delivery-app",
    "https://appsmez.com/ecommerce-delivery-app",
    "https://appsmez.com/express-app",
    "https://appsmez.com/food-ordering-app",
    "https://appsmez.com/hotel-booking-app",
    "https://appsmez.com/reward-point-app",
    "https://appsmez.com/elearning-app",
    "https://reviews.appsmez.com/appsmezblogs/",
    "https://reviews.appsmez.com/sme_review/",
    "https://fooddee.co/th/",
    "https://fooddee.co/th/franchise/",
    "https://fooddee.co/th/delivery/",
    "https://fooddee.co/th/travel/",
    "https://fooddee.co/th/taxi/",
    "https://www.sc-sparksolution.com/",
    "https://www.sc-sparksolution.com/sme-erp/",
    "https://www.sc-sparksolution.com/%e0%b8%a3%e0%b8%b1%e0%b8%9a%e0%b8%97%e0%b8%b3-mobile-application/",
    "https://www.sc-sparksolution.com/cms-smez-app/",
    "https://www.sc-sparksolution.com/digital-marketing/",
    "https://www.sc-sparksolution.com/promote-application/",
    "https://www.sc-sparksolution.com/google-ads/",
    "https://www.sc-sparksolution.com/facebook-ads/",
    "https://www.sc-sparksolution.com/youtube-ads/",
    "https://www.sc-sparksolution.com/content-marketing/",
    "https://www.sc-sparksolution.com/line-oa/",
    "https://www.sc-sparksolution.com/%e0%b8%a3%e0%b8%b1%e0%b8%9a%e0%b8%97%e0%b8%b3%e0%b9%80%e0%b8%a7%e0%b9%87%e0%b8%9a%e0%b9%84%e0%b8%8b%e0%b8%95%e0%b9%8c-e-commerce-%e0%b8%94%e0%b9%89%e0%b8%a7%e0%b8%a2-opencart/",
    "https://www.sc-sparksolution.com/%e0%b8%a3%e0%b8%b1%e0%b8%9a%e0%b8%97%e0%b8%b3%e0%b9%80%e0%b8%a7%e0%b9%87%e0%b8%9a%e0%b9%84%e0%b8%8b%e0%b8%95%e0%b9%8c-e-commerce-%e0%b9%81%e0%b8%a5%e0%b8%b0%e0%b8%ad%e0%b8%ad%e0%b8%81%e0%b9%81/",
    "https://www.sc-sparksolution.com/%e0%b8%a3%e0%b8%b1%e0%b8%9a%e0%b8%97%e0%b8%b3%e0%b9%80%e0%b8%a7%e0%b9%87%e0%b8%9a%e0%b9%84%e0%b8%8b%e0%b8%95%e0%b9%8c-responsive-design/",
    "https://www.sc-sparksolution.com/%e0%b8%a3%e0%b8%b1%e0%b8%9a%e0%b8%97%e0%b8%b3-seo-%e0%b8%94%e0%b9%89%e0%b8%a7%e0%b8%a2%e0%b9%80%e0%b8%97%e0%b8%84%e0%b8%99%e0%b8%b4%e0%b8%84%e0%b8%a1%e0%b8%b7%e0%b8%ad%e0%b8%ad%e0%b8%b2%e0%b8%8a/",
    "https://www.sc-sparksolution.com/%e0%b8%a3%e0%b8%b1%e0%b8%9a%e0%b8%97%e0%b8%b3-enterprise-java-application/",
    "https://www.sc-sparksolution.com/%e0%b8%9c%e0%b8%a5%e0%b8%87%e0%b8%b2%e0%b8%99%e0%b8%82%e0%b8%ad%e0%b8%87%e0%b9%80%e0%b8%a3%e0%b8%b2/",
    "https://www.sc-sparksolution.com/%e0%b8%a3%e0%b8%b2%e0%b8%84%e0%b8%b2%e0%b9%81%e0%b8%9e%e0%b8%84%e0%b9%80%e0%b8%81%e0%b8%88/"

]

# 🔹 Web Scraper: ดึงข้อมูลจากแต่ละหน้า
def scrape_website(url):
    try:
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.text, "html.parser")

        # ดึงเฉพาะข้อความที่สำคัญ
        texts = soup.stripped_strings
        page_text = "\n".join(texts)

        return page_text
    except Exception as e:
        print(f"❌ Error scraping {url}: {e}")
        return ""

# 🔹 โหลดข้อมูลทั้งหมดจากเว็บไซต์
def load_all_web_content():
    docs = []
    for url in URLS:
        content = scrape_website(url)
        if content:
            doc = Document(page_content=content, metadata={"source": url})
            docs.append(doc)
    logging.info(f"✅ Total documents scraped: {len(docs)}")
    return docs

# 🔹 สร้าง FAISS vectorstore
def build_vectorstore(docs, persist_path="faiss_index_web"):
    embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)
    vectorstore = FAISS.from_documents(docs, embeddings)
    vectorstore.save_local(persist_path)
    return vectorstore

# 🔹 สร้าง QA chain
# def build_qa_chain(vectorstore):
#     prompt_template = PromptTemplate(
#         input_variables=["context", "question"],
#         template="""
# คุณคือผู้ช่วย AI ที่ให้ข้อมูลจากเว็บไซต์ของบริษัทอย่างสุภาพและชัดเจน
# ข้อมูลต่อไปนี้คือบริบทที่เกี่ยวข้อง:

# {context}

# คำถาม: {question}
# กรุณาตอบโดยใช้ภาษาที่สุภาพ และหากไม่มีข้อมูล กรุณาตอบว่า 'ขออภัย ไม่พบข้อมูลในระบบ'
# """
#     )

#     retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
#     chain = RetrievalQA.from_chain_type(
#         llm=ChatOpenAI(model_name="gpt-4"),
#         retriever=retriever,
#         chain_type_kwargs={"prompt": prompt_template}
#     )
#     return chain

# # 🔹 ล้างคำตอบให้เหมาะสม
# def clean_answer(text):
#     text = re.sub(r'[^\u0E00-\u0E7F\s0-9,.!?()\-]', '', text)
#     text = re.sub(r'\s+', ' ', text).strip()
#     return text

# # 🔹 ฟังก์ชันถาม-ตอบ
# def ask(question):
#     docs = load_all_web_content()
#     vectorstore = build_vectorstore(docs)
#     qa = build_qa_chain(vectorstore)
#     raw_answer = qa.run(question)
#     return clean_answer(raw_answer)

def load_vectorstore(persist_path="faiss_index_web"):
    if not os.path.exists(persist_path):
        logging.warning("FAISS index not found, building new one...")
        docs = load_all_web_content()
        return build_vectorstore(docs, persist_path)
    embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)
    return FAISS.load_local(persist_path, embeddings)

def build_qa_chain(vectorstore):
    prompt_template = PromptTemplate(
        input_variables=["context", "question"],
        template="""
คุณคือผู้ช่วย AI ของบริษัทที่ให้ข้อมูลจากเว็บไซต์ของบริษัทเท่านั้น
ห้ามแต่งหรือเดาข้อมูล หากไม่มีข้อมูลตรง กรุณาตอบว่า 'ขออภัย ไม่พบข้อมูลในระบบ'

ข้อมูลต่อไปนี้คือบริบทที่เกี่ยวข้อง:

{context}

คำถาม: {question}
กรุณาตอบโดยสุภาพและใช้เฉพาะข้อมูลจากบริบทข้างต้นเท่านั้น
"""
    )
    retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
    chain = RetrievalQA.from_chain_type(
        llm=ChatOpenAI(model_name="gpt-4", temperature=0),
        retriever=retriever,
        chain_type_kwargs={"prompt": prompt_template}
    )
    return chain

def clean_answer(text):
    text = re.sub(r'[^\u0E00-\u0E7F\s0-9,.!?()\-]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def is_valid_question(question):
    """ตรวจสอบว่าคำถามมีความหมาย ไม่ใช่ spam หรือมั่ว"""
    question = question.strip()

    # ปฏิเสธคำถามที่สั้นเกินไป
    if len(question) < 5:
        return False

    # ปฏิเสธคำถามที่เป็นตัวอักษรซ้ำ เช่น '55555', 'aaaaa'
    if len(set(question)) <= 2:
        return False

    # ปฏิเสธคำถามที่เป็นตัวเลขล้วน หรือไม่มีตัวอักษรเลย
    if not re.search(r'[ก-๙a-zA-Z]', question):
        return False

    # ปฏิเสธคำถามที่เป็นสัญลักษณ์พิเศษล้วน
    if re.fullmatch(r'[^\w\s]+', question):
        return False

    return True

def log_to_jsonl(question, answer, file_path="chat_training_data.jsonl"):
    data = {
        "prompt": question.strip(),
        "completion": answer.strip()
    }
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False) + "\n")

def ask(question):
    logging.info(f"[ASK] Question: {question}")

    if not is_valid_question(question):
        logging.warning("[ASK] Invalid or spam-like question. Skipping.")
        return "ขออภัย กรุณาถามคำถามที่ชัดเจนและเกี่ยวข้องมากกว่านี้"

    vectorstore = load_vectorstore()
    qa = build_qa_chain(vectorstore)
    raw_answer = qa.run(question)
    final_answer = clean_answer(raw_answer)

    # บันทึกเฉพาะคำตอบที่มีเนื้อหา
    if final_answer:
        log_to_jsonl(question, final_answer)
        logging.info(f"[ASK] Answer: {final_answer}")
        return final_answer
    else:
        logging.info("[ASK] No useful answer found.")
        return "ขออภัย ไม่พบข้อมูลในระบบ"

```

-  Code สำหรับ **"embedder.py"**
```bash
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pathlib import Path

def load_documents_and_build_vectorizer():
    docs = []
    paths = []

    base_dirs = ["appSmez", "fooddee", "scspark"]
    for base in base_dirs:
        for md_file in Path(base).rglob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            chunks = [content[i:i+300] for i in range(0, len(content), 300)]
            docs.extend(chunks)
            paths.extend([md_file.name] * len(chunks))

    vectorizer = TfidfVectorizer().fit(docs)
    vectors = vectorizer.transform(docs)
    return docs, vectors, vectorizer

def retrieve_relevant_chunks(question, docs, vectors, vectorizer, top_k=3):
    question = question.lower().strip()
    q_vec = vectorizer.transform([question])
    similarities = cosine_similarity(q_vec, vectors).flatten()
    top_indices = similarities.argsort()[-top_k:][::-1]
    relevant_texts = [docs[i].strip() for i in top_indices if similarities[i] > 0.1]

    return "\n\n".join([f"- {text}" for text in relevant_texts]) if relevant_texts else ""

```

-  Code สำหรับ **"static => script.js "**
```bash
async function sendQuestion() {
  const input = document.getElementById("user-input");
  const question = input.value;
  input.value = "";

  const chatBox = document.getElementById("chat-box");
  chatBox.innerHTML += `<div class="user">คุณ: ${question}</div>`;

  const res = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });

  const data = await res.json();
  chatBox.innerHTML += `<div class="bot">บอท: ${data.answer}</div>`;
  chatBox.scrollTop = chatBox.scrollHeight;
}
```

-  Code สำหรับ **"templates => index.html "**
```bash
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8" />
    <title>Chatbot</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 700px;
            margin: 30px auto;
            padding: 10px;
            background-color: #f5f5f5;
        }
        .chat-container {
            border: 1px solid #ccc;
            padding: 15px;
            background: white;
            height: 500px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .message {
            max-width: 70%;
            padding: 8px 12px;
            border-radius: 12px;
            line-height: 1.3;
            word-wrap: break-word;
        }
        .user {
            align-self: flex-end;
            background-color: #cce5ff;
            text-align: right;
        }
        .bot {
            align-self: flex-start;
            background-color: #d4edda;
            text-align: left;
        }
        form {
            margin-top: 10px;
            display: flex;
            gap: 5px;
        }
        input[type=text] {
            flex: 1;
            padding: 8px;
            font-size: 1em;
        }
        button {
            padding: 8px 15px;
            font-size: 1em;
        }
    </style>
</head>
<body>
    <h1>Chatbot</h1>
    <div class="chat-container" id="chat-container"></div>

    <form id="chat-form">
        <input type="text" id="message-input" autocomplete="off" placeholder="พิมพ์ข้อความ..." required />
        <button type="submit">ส่ง</button>
    </form>

    <script>
        const chatContainer = document.getElementById('chat-container');
        const form = document.getElementById('chat-form');
        const input = document.getElementById('message-input');

        async function loadMessages() {
            const res = await fetch('/messages');
            const data = await res.json();

            chatContainer.innerHTML = '';
            if (data.length === 0) {
                const botDiv = document.createElement('div');
                botDiv.className = 'message bot';
                botDiv.innerHTML = `<strong>น้ำใส AI:</strong> สวัสดี ยินดีให้บริการ กรุณาพิมพ์คำถามเกี่ยวกับข้อมูลของบริษัท`;
                chatContainer.appendChild(botDiv);
            } else {
                data.forEach(msg => {
                    const div = document.createElement('div');
                    div.className = `message ${msg.sender}`;
                    div.innerHTML = `<strong>${msg.sender === 'user' ? 'คุณ' : 'น้ำใส AI'}:</strong> ${msg.text}`;
                    chatContainer.appendChild(div);
                });
            }
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = input.value.trim();
            if (!message) return;

            const userDiv = document.createElement('div');
            userDiv.className = 'message user';
            userDiv.innerHTML = `<strong>คุณ:</strong> ${message}`;
            chatContainer.appendChild(userDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            input.value = '';
            input.disabled = true;

            const res = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `message=${encodeURIComponent(message)}`
            });
            const result = await res.json();

            const botDiv = document.createElement('div');
            botDiv.className = 'message bot';
            botDiv.innerHTML = `<strong>น้ำใส AI:</strong> ${result.reply}`;
            chatContainer.appendChild(botDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            input.disabled = false;
            input.focus();
        });

        loadMessages();
    </script>
</body>
</html>

```

-  Code สำหรับ **" .env "**
```bash
LINE_CHANNEL_ACCESS_TOKEN=       # "CHANNEL ACCESS TOKEN" ของ ChatLine ของคุณ
LINE_CHANNEL_SECRET=             # "CHANNEL SECRET" ของ ChatLine ของคุณ
```


### 5.การติดตั้ง ngrok และเป็นตัวเชื่อมกับ Line
1. วิธีติดตั้ง ngrok บน macOS
✅ วิธีที่ง่ายที่สุด: ติดตั้งผ่าน Homebrew
```bash
brew install --cask ngrok
```

✅ ตรวจสอบว่า ngrok ติดตั้งสำเร็จแล้ว:

```bash
ngrok version
```

2. ลงทะเบียนบัญชี ngrok และตั้งค่า Token
➤ ไปที่: https://dashboard.ngrok.com/signup
สมัครและเข้าสู่ระบบ แล้วคุณจะได้ Auth Token

➤ จากนั้น รันคำสั่งนี้เพื่อเชื่อม Token กับเครื่องของคุณ:
```bash
ngrok config add-authtoken <your_token_here>
```
ตัวอย่าง:
```bash
ngrok config add-authtoken 2N8HxxxxxxYYYYzzzzzz
```

3. สร้าง Public URL ด้วย ngrok
สมมติว่า FastAPI ของคุณรันอยู่ที่ localhost:8000 ให้ใช้คำสั่ง:
```bash
ngrok http 8000
```
คุณจะได้ URL ประมาณนี้:
```bash
https://abc1234.ngrok.io
```

4. เชื่อมต่อ LINE Messaging API
📌 สิ่งที่ต้องเตรียม:
LINE Developer Account → https://developers.line.biz/

LINE Messaging API → สร้าง Provider + Channel

Channel Access Token

Channel Secret

📝 ขั้นตอนการตั้งค่า Webhook
เข้า LINE Developers Console

ไปที่ Project → Messaging API

ตั้งค่า Webhook URL เป็น:
```bash
https://abc1234.ngrok.io/webhook
```

เปิด "Use Webhook" เป็น ON

กด "Verify" เพื่อลองยิง POST ไปที่ /webhook ของ FastAPI




## การ Run Project
### 1. สร้าง Virtual Environment และติดตั้งไลบรารี
```bash
python3 -m venv venv
source venv/bin/activate
```
### 2. ติดตั้งไลบรารีจาก requirements.txt
```bash
pip install -r requirements.txt
```
### 3. ติดตั้งและรัน Ollama พร้อมโหลดโมเดล llama3
ติดตั้ง Ollama (ครั้งเดียวเท่านั้น)
```bash
brew install ollama
```
โหลดโมเดล LLaMA3
```bash
ollama pull llama3:latest
```
รันโมเดลให้ทำงานอยู่เบื้องหลัง
```bash
ollama run llama3
```
### 4.Run Project
```bash
uvicorn app:app --reload
```
### 5. Run ngrok เพื่อใช้งาน URL
-  split terminal
```bash
ngrok http 8000 
```
จะได้ URL มา ให้คัดลอกนำไปใส่ในช่อง Webhook ของ LINE Messaging API
ตัวอย่าง
```bash
https://abc1234.ngrok.io/webhook
```

# ทดลองใช้งาน Line Chatbot ได้เลย
