"use client";

import React, { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";

// ฟังก์ชันแปลงข้อความเป็น Binary 8-bit ต่อ 1 ตัวอักษร
const toBinary = (str: string) => {
  return str
    .split("")
    .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
    .join(" ");
};

// ฟังก์ชันคำนวณ XOR ระหว่าง 2 สตริง
const xorStrings = (str1: string, str2: string) => {
  let res = "";
  for (let i = 0; i < str1.length; i++) {
    const code = str1.charCodeAt(i) ^ str2.charCodeAt(i);
    res += code.toString(16).padStart(2, "0").toUpperCase();
  }
  return res;
};

export default function Home() {
  const [role, setRole] = useState<"SELECT" | "ENCRYPTER" | "DECRYPTER">("SELECT");
  const [roomId, setRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState("");
  const [connected, setConnected] = useState(false);

  // ข้อมูลโจทย์ระเบิด
  const [targetWord, setTargetWord] = useState("CAT");
  const [secretKey, setSecretKey] = useState("BAT");
  const [timeLimit, setTimeLimit] = useState(120);

  // สถานะการเล่น
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameStatus, setGameStatus] = useState<"IDLE" | "PLAYING" | "DEFUSED" | "EXPLODED">("IDLE");
  const [cipherHex, setCipherHex] = useState("");
  const [receivedKey, setReceivedKey] = useState("");
  const [receivedKeyBinary, setReceivedKeyBinary] = useState("");
  const [receivedCipherBinary, setReceivedCipherBinary] = useState("");
  const [decrypterInput, setDecrypterInput] = useState("");

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  // เริ่มต้นสร้างห้องหรือเชื่อมต่อ P2P
  useEffect(() => {
    import("peerjs").then(({ default: Peer }) => {
      const generatedId = Math.random().toString(36).substring(2, 6).toUpperCase();
      const peer = new Peer(generatedId);
      peerRef.current = peer;

      peer.on("open", (id) => {
        setRoomId(id);
      });

      peer.on("connection", (conn) => {
        connRef.current = conn;
        setupConnection(conn);
      });
    });

    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const connectToRoom = () => {
    if (!peerRef.current || !inputRoomId) return;
    const conn = peerRef.current.connect(inputRoomId.toUpperCase());
    connRef.current = conn;
    setupConnection(conn);
  };

  const setupConnection = (conn: any) => {
    conn.on("open", () => {
      setConnected(true);
    });

    conn.on("data", (data: any) => {
      if (data.type === "ARM_BOMB") {
        setCipherHex(data.cipherHex);
        setReceivedKey(data.secretKey);
        setReceivedKeyBinary(toBinary(data.secretKey));
        setReceivedCipherBinary(data.cipherBinary);
        setTimeLeft(data.timeLimit);
        setGameStatus("PLAYING");
      } else if (data.type === "GAME_OVER") {
        setGameStatus(data.status);
        if (data.status === "DEFUSED") {
          confetti();
        }
      }
    });
  };

  // ตัวนับเวลาถอยหลังระเบิด
  useEffect(() => {
    let timer: any;
    if (gameStatus === "PLAYING" && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleExplode();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameStatus, timeLeft]);

  // ฝั่งคนตั้งระเบิดกดยืนยันปล่อยระเบิด
  const handleArmBomb = () => {
    if (targetWord.length !== secretKey.length) {
      alert("ความยาวคำศัพท์และ Key ต้องมีจำนวนตัวอักษรเท่ากัน!");
      return;
    }

    const hex = xorStrings(targetWord.toUpperCase(), secretKey.toUpperCase());
    
    // แปลง XOR Hex กลับเป็นกลุ่มบิต Binary
    let cBin = "";
    for (let i = 0; i < targetWord.length; i++) {
      const xorVal = targetWord.toUpperCase().charCodeAt(i) ^ secretKey.toUpperCase().charCodeAt(i);
      cBin += xorVal.toString(2).padStart(8, "0") + " ";
    }

    const bombData = {
      type: "ARM_BOMB",
      cipherHex: hex,
      cipherBinary: cBin.trim(),
      secretKey: secretKey.toUpperCase(),
      targetWord: targetWord.toUpperCase(),
      timeLimit: timeLimit,
    };

    if (connRef.current) {
      connRef.current.send(bombData);
    }

    setCipherHex(hex);
    setTimeLeft(timeLimit);
    setGameStatus("PLAYING");
  };

  // ฝั่งกู้ระเบิดกดส่งคำตอบ
  const handleDefuseAttempt = () => {
    if (connRef.current) {
      // ตรวจสอบกับคำตั้งต้นที่ฝั่งคนตั้งรหัสส่งมา
      // ในระบบนี้เราให้ส่งไปเช็ค หรือเช็คคำตรงๆ
      const isSuccess = decrypterInput.trim().toUpperCase() === targetWord.toUpperCase();
      const status = isSuccess ? "DEFUSED" : "EXPLODED";
      setGameStatus(status);
      connRef.current.send({ type: "GAME_OVER", status });
      if (isSuccess) confetti();
    }
  };

  const handleExplode = () => {
    setGameStatus("EXPLODED");
    if (connRef.current) {
      connRef.current.send({ type: "GAME_OVER", status: "EXPLODED" });
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen p-4 flex flex-col items-center justify-center">
      {/* ส่วนหัวแสดงผลห้องและการเชื่อมต่อ */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-4 bg-zinc-900 border-2 border-zinc-700 p-3 text-lg">
        <div>
          <span>ROOM ID: </span>
          <span className="text-yellow-400 font-bold tracking-widest">{roomId || "CREATING..."}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          <span>{connected ? "LINKED TO PEER" : "WAITING FOR PARTNER"}</span>
        </div>
      </div>

      {/* หน้าต่างเลือกบทบาท */}
      {role === "SELECT" && (
        <div className="pixel-box p-8 max-w-md w-full text-center">
          <h1 className="text-3xl text-yellow-400 mb-6 font-bold tracking-wider">DEFUSE PROTOCOL: XOR</h1>
          <p className="text-zinc-400 mb-6 text-sm">เลือกบทบาทของคุณในภารกิจนี้</p>
          
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setRole("ENCRYPTER")}
              className="pixel-btn bg-red-700 hover:bg-red-600 text-white py-3 text-xl tracking-wider"
            >
              MODULE A: BOMB OPERATOR (คนตั้งรหัส)
            </button>
            <button
              onClick={() => setRole("DECRYPTER")}
              className="pixel-btn bg-blue-700 hover:bg-blue-600 text-white py-3 text-xl tracking-wider"
            >
              MODULE B: DEFUSER (คนกู้ระเบิด)
            </button>
          </div>

          <div className="mt-8 border-t-2 border-zinc-700 pt-4">
            <p className="text-sm text-zinc-400 mb-2">เชื่อมต่อผ่านรหัสห้อง (Room ID ฝั่งตรงข้าม):</p>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={4}
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                placeholder="4-CHAR ID"
                className="bg-black border border-zinc-600 px-3 py-1 text-center text-yellow-300 w-full"
              />
              <button
                onClick={connectToRoom}
                className="pixel-btn bg-emerald-700 text-white px-4 py-1"
              >
                CONNECT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* หน้าต่างคนตั้งระเบิด (ENCRYPTER) */}
      {role === "ENCRYPTER" && (
        <div className="pixel-box p-6 max-w-2xl w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl text-red-500 font-bold">OPERATOR STATION (ENCRYPT)</h2>
            <button onClick={() => setRole("SELECT")} className="text-xs text-zinc-500 underline">CHANGE ROLE</button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">ORIGINAL WORD (คำศัพท์ 3-4 ตัว):</label>
              <input
                type="text"
                maxLength={4}
                disabled={gameStatus === "PLAYING"}
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value.toUpperCase())}
                className="w-full bg-black border-2 border-zinc-700 p-2 text-xl text-yellow-400 tracking-widest text-center"
              />
              <div className="text-[10px] text-zinc-500 mt-1">BIN: {toBinary(targetWord)}</div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">SECRET KEY (กุญแจความยาวเท่ากัน):</label>
              <input
                type="text"
                maxLength={4}
                disabled={gameStatus === "PLAYING"}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                className="w-full bg-black border-2 border-zinc-700 p-2 text-xl text-cyan-400 tracking-widest text-center"
              />
              <div className="text-[10px] text-zinc-500 mt-1">BIN: {toBinary(secretKey)}</div>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-zinc-400 block mb-1">COUNTDOWN (SECONDS):</label>
            <select
              value={timeLimit}
              disabled={gameStatus === "PLAYING"}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="bg-black border border-zinc-700 p-2 text-white w-full"
            >
              <option value={60}>60 วินาที</option>
              <option value={120}>120 วินาที</option>
              <option value={180}>180 วินาที</option>
            </select>
          </div>

          {gameStatus === "IDLE" ? (
            <button
              onClick={handleArmBomb}
              className="w-full pixel-btn bg-red-600 hover:bg-red-500 text-black font-bold py-3 text-2xl tracking-widest"
            >
              ARM BOMB & TRANSMIT
            </button>
          ) : (
            <div className="text-center p-4 bg-black border-2 border-red-900">
              <div className="text-4xl text-red-500 led-display mb-2">{formatTimer(timeLeft)}</div>
              <p className="text-yellow-500 text-sm animate-pulse">BOMB ARMED: WAITING FOR DEFUSAL...</p>
            </div>
          )}

          {/* สรุปผลลัพธ์ */}
          {gameStatus === "DEFUSED" && (
            <div className="mt-4 p-4 bg-green-950 border border-green-500 text-center text-green-400 text-xl font-bold">
              ระเบิดถูกกู้สำเร็จ! ฝั่งถอดรหัสเป็นฝ่ายชนะ
            </div>
          )}
          {gameStatus === "EXPLODED" && (
            <div className="mt-4 p-4 bg-red-950 border border-red-500 text-center text-red-500 text-xl font-bold animate-bounce">
              BOOM! ระเบิดทำงาน! ฝั่งตั้งรหัสเป็นฝ่ายชนะ
            </div>
          )}
        </div>
      )}

      {/* หน้าต่างคนกู้ระเบิด (DECRYPTER) โมเดลเคสระเบิด */}
      {role === "DECRYPTER" && (
        <div className="pixel-box p-6 max-w-3xl w-full border-4 border-slate-700 bg-slate-900">
          {/* Header ระเบิด */}
          <div className="flex justify-between items-center bg-black p-3 border-2 border-zinc-800 mb-6">
            <div>
              <span className="text-xs text-zinc-500 block">DETONATION TIMER</span>
              <span className="text-5xl text-red-600 led-display font-bold">
                {formatTimer(timeLeft)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-500 block">STATUS</span>
              <span className={`text-xl font-bold ${
                gameStatus === "PLAYING" ? "text-red-500 animate-pulse" :
                gameStatus === "DEFUSED" ? "text-green-500" :
                gameStatus === "EXPLODED" ? "text-red-600" : "text-zinc-500"
              }`}>
                {gameStatus}
              </span>
            </div>
          </div>

          {/* โมดูลสัญญาณรหัส */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-black p-4 border-2 border-zinc-800">
              <span className="text-xs text-yellow-500 block mb-1">INTERCEPTED CIPHER (HEX):</span>
              <div className="text-2xl text-white tracking-widest bg-zinc-950 p-2 border border-zinc-700 text-center">
                {cipherHex || "WAITING..."}
              </div>
              <div className="text-xs text-zinc-500 mt-2 break-all">
                BITS: {receivedCipherBinary || "----------------"}
              </div>
            </div>

            <div className="bg-black p-4 border-2 border-zinc-800">
              <span className="text-xs text-cyan-400 block mb-1">GIVEN KEY:</span>
              <div className="text-2xl text-cyan-300 tracking-widest bg-zinc-950 p-2 border border-zinc-700 text-center">
                {receivedKey || "WAITING..."}
              </div>
              <div className="text-xs text-zinc-500 mt-2 break-all">
                BITS: {receivedKeyBinary || "----------------"}
              </div>
            </div>
          </div>

          {/* ตารางคู่มือ XOR Logic สรุปสั้นๆ */}
          <div className="bg-zinc-950 p-3 border border-zinc-800 mb-6 text-xs text-zinc-400 flex justify-around">
            <span>RULE: 0 XOR 0 = 0</span>
            <span>0 XOR 1 = 1</span>
            <span>1 XOR 0 = 1</span>
            <span className="text-yellow-400">1 XOR 1 = 0</span>
          </div>

          {/* แผงปุ่มกดตัดระเบิด */}
          <div className="bg-black p-4 border-2 border-zinc-800 flex flex-col items-center">
            <label className="text-sm text-zinc-400 mb-2">INPUT DECRYPTED WORD (กรอกคำศัพท์ที่ถอดรหัสได้):</label>
            <input
              type="text"
              maxLength={4}
              disabled={gameStatus !== "PLAYING"}
              value={decrypterInput}
              onChange={(e) => setDecrypterInput(e.target.value.toUpperCase())}
              placeholder="????"
              className="bg-zinc-900 border-2 border-red-700 text-yellow-400 text-3xl text-center py-2 px-6 tracking-widest mb-4 w-48"
            />
            <button
              onClick={handleDefuseAttempt}
              disabled={gameStatus !== "PLAYING"}
              className={`w-full py-4 text-2xl font-bold tracking-widest pixel-btn ${
                gameStatus === "PLAYING"
                  ? "bg-red-700 hover:bg-red-600 text-white cursor-pointer"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              }`}
            >
              CONFIRM DEFUSE (กดยืนยันตัดวงจร)
            </button>
          </div>

          {/* สรุปผลกู้ระเบิด */}
          {gameStatus === "DEFUSED" && (
            <div className="mt-4 p-4 bg-green-900 text-white text-center text-2xl font-bold border-2 border-green-400">
              *** BOMB DEFUSED SUCCESSFULLY ***
            </div>
          )}
          {gameStatus === "EXPLODED" && (
            <div className="mt-4 p-4 bg-red-900 text-white text-center text-2xl font-bold border-2 border-red-500 animate-pulse">
              *** CRITICAL ERROR: DETONATED ***
            </div>
          )}
        </div>
      )}
    </main>
  );
}