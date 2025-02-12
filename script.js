// ตรวจสอบว่า Three.js โหลดได้หรือไม่
console.log(THREE);

// สร้าง Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ขอบเขตของเกม
const boundaryX = 4.5;
const boundaryY = 3;

// สร้างลูกบอล
const geometry = new THREE.SphereGeometry(0.3, 32, 32);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const ball = new THREE.Mesh(geometry, material);
scene.add(ball);

// สร้างสิ่งกีดขวาง (เคลื่อนที่)
const obstacles = [];
function createMovingObstacle(x, y, speed) {
    const boxGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.set(x, y, 0);
    scene.add(box);
    obstacles.push({ mesh: box, speed: speed, direction: 1 });
}

// เพิ่มสิ่งกีดขวาง
createMovingObstacle(-2, 0, 0.02);
createMovingObstacle(1, 1, 0.03);
createMovingObstacle(-1, -1, 0.015);
createMovingObstacle(3, -2, 0.025);
createMovingObstacle(-3, 2, 0.02);

// สร้างห่วง
let ring;
function createRing(x, y) {
    const ringGeometry = new THREE.TorusGeometry(0.5, 0.1, 16, 100);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(x, y, 0);
    scene.add(ring);
}

// ฟังก์ชันรีเซ็ตห่วงใหม่ (สุ่มตำแหน่ง)
function resetRing() {
    // รีเซ็ตห่วงในตำแหน่งสุ่ม
    const x = Math.random() * (boundaryX * 2) - boundaryX;
    const y = Math.random() * (boundaryY * 2) - boundaryY;
    createRing(x, y);
}

// เพิ่มห่วงในเกมครั้งแรก
resetRing();

// กำหนดตำแหน่งกล้อง
camera.position.z = 5;

// ตัวแปรสำหรับควบคุมการเคลื่อนที่
let speedX = 0;
let speedY = 0;
const moveSpeed = 0.05;

// ตัวแปรสำหรับคะแนน
let score = 0;
const scoreElement = document.createElement("div");
scoreElement.style.position = "absolute";
scoreElement.style.top = "10px";
scoreElement.style.left = "10px";
scoreElement.style.color = "white";
scoreElement.style.fontSize = "20px";
scoreElement.innerHTML = `Score: ${score}`;  // แก้ไขที่นี่
document.body.appendChild(scoreElement);

// ฟังก์ชันจับคีย์บอร์ด
document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") speedX = moveSpeed;
    if (event.key === "ArrowLeft") speedX = -moveSpeed;
    if (event.key === "ArrowUp") speedY = moveSpeed;
    if (event.key === "ArrowDown") speedY = -moveSpeed;
});

document.addEventListener("keyup", (event) => {
    if (["ArrowRight", "ArrowLeft"].includes(event.key)) speedX = 0;
    if (["ArrowUp", "ArrowDown"].includes(event.key)) speedY = 0;
});

// ตรวจสอบการชน
function checkCollision(object1, object2, distanceThreshold) {
    const dx = object1.position.x - object2.position.x;
    const dy = object1.position.y - object2.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < distanceThreshold;
}

// รีเซ็ตเกม
function resetGame() {
    alert(`Game Over! Your Score: ${score}`);
    ball.position.set(0, 0, 0);
    score = 0;
    scoreElement.innerHTML = `Score: ${score}`;
    scene.remove(ring); // ลบห่วงเก่า
    resetRing();  // รีเซ็ตห่วงใหม่
}

// Loop สำหรับ animation
function animate() {
    requestAnimationFrame(animate);

    // อัปเดตตำแหน่งลูกบอล
    let newX = ball.position.x + speedX;
    let newY = ball.position.y + speedY;

    // ตรวจสอบขอบเขตของเกม
    if (newX > boundaryX) newX = boundaryX;
    if (newX < -boundaryX) newX = -boundaryX;
    if (newY > boundaryY) newY = boundaryY;
    if (newY < -boundaryY) newY = -boundaryY;

    // ตรวจสอบการชนกับสิ่งกีดขวาง
    for (let obstacle of obstacles) {
        if (checkCollision({ position: { x: newX, y: newY } }, obstacle.mesh, 0.6)) {
            resetGame();
            return;
        }
    }

    // ตรวจสอบการเก็บห่วง
    if (checkCollision(ball, ring, 0.7)) {
        // รีเซ็ตห่วงใหม่
        scene.remove(ring);  // ลบห่วงเก่า
        resetRing();  // สร้างห่วงใหม่
        score += 10;  // เพิ่มคะแนนเมื่อเก็บห่วง
    }

    ball.position.x = newX;
    ball.position.y = newY;

    // อัปเดตสิ่งกีดขวาง (เคลื่อนที่)
    for (let obstacle of obstacles) {
        obstacle.mesh.position.y += obstacle.speed * obstacle.direction;
        if (obstacle.mesh.position.y > boundaryY || obstacle.mesh.position.y < -boundaryY) {
            obstacle.direction *= -1; // เปลี่ยนทิศทาง
        }
    }

    // เพิ่มคะแนนเมื่ออยู่รอด
    score++;
    scoreElement.innerHTML = `Score: ${score}`;

    // เรนเดอร์ Scene
    renderer.render(scene, camera);
}
animate();


// โหลดภาพพื้นหลัง
const loader = new THREE.TextureLoader();
loader.load('https://img.pikbest.com/back_our/20210930/bg/45a6402923931bce3f7dc655d5b34f1f_102583.png!sw800', function(texture) {
    scene.background = texture;
});

