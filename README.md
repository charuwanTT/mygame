# **Chatbot LLM + Line**

# 1. Clone โปรเจกต์
ทำการ Clone git ของเราไปไว้ใน Folder ที่สะดวก

# 2. เปิด VS code เพื่อเปิด Folder Project

เมื่อเปิดแล้ว Downlode VENV เพื่อใช้ไลบารี่ต่างๆ ให้สะดวกต่อการใช้งาน

**สร้าง VENV**

```bash
# สร้าง venv
python -m venv venv
source venv/bin/activate         # บน macOS / Linux
venv\Scripts\activate            # บน Windows
```
**run requirements.txt เพื่อโหลดไลบารี่ที่จำเป็นสำหรับ Project**
```bash
pip install -r requirements.txt
```
**Downlode Model ที่ต้องการจะใช้ ผ่าน Ollama (LLM)**
- ollama3:latest
- mistral
- qwen7b-chat

หรือตัวอื่นที่ผู้ใช้สะดวก

```bash
# คำสั่ง Model ที่ต้องการจะใช้
ollama run llama3:latest
ollama run mistral
ollama run qwen:7b-chat

```
**เลือกใช้ Model ตามที่ต้องการ เมื่อได้ Model ที่ต้องการให้ทำการแก้ไข Code ใน file **app.py** ใน บรรทัดที่ 144 และ 212**
![Screenshot 2025-06-10 231533](https://github.com/user-attachments/assets/87b03cc1-c237-443b-b842-157c48dd3c26)


![Screenshot 2025-06-10 231205](https://github.com/user-attachments/assets/3726dea7-d20b-4d25-bd8c-48087b015cba)



# 3. เชื่อมต่อกับ Line 
  ## ทำการเอา Key ต่างๆมาใช้
  - LINE_CHANNEL_ACCESS_TOKEN=ใส่โทเคนที่ได้จาก LINE Developer Console
  
  - LINE_CHANNEL_SECRET=ใส่ซีเคร็ตที่ได้จาก LINE Developer Console
![Screenshot 2025-06-10 232144](https://github.com/user-attachments/assets/2336083e-3163-40aa-9a7e-411e660cf202)
ในบรรทัดที่ 165,166


# 4. ทำการ run Project
 ## เปิด Terminal ใช่คำสั่งด้านล่างนี้
 
```bash
# run Prooject
uvicorn main:app --reload
```
![Screenshot 2025-06-10 233029](https://github.com/user-attachments/assets/6a7cacc7-0eaa-4ba6-b3f9-15754057d51b)



 ## เชื่อมต่อกับ ngrok
 กด split Terminal แล้ว run คพสั่งด้านล่างนี้
 ```bash
# เชื่อม ngrok
ngrok http 8000

```
 หลังจากนั้นจะได้ URL มา ให้นำไปใส่ใน Webhook ของ Line
![Screenshot 2025-06-10 233255](https://github.com/user-attachments/assets/382eb610-c55b-48fb-bf7b-1af1ced2c0b0)


 นำไปใส่ใน Webhook URL
![Screenshot 2025-06-10 233212](https://github.com/user-attachments/assets/fa52811e-f379-458f-b339-1f6f46818206)

หลังจากนั้นทดลองเล่นแชทบอทได้เลย 


