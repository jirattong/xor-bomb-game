"use client";

import React, { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";

const toBinary = (str: string) => {
  return str
    .split("")
    .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
    .join(" ");
};

const xorHex = (str1: string, str2: string) => {
  let res = "";
  for (let i = 0; i < str1.length; i++) {
    const code = str1.charCodeAt(i) ^ str2.charCodeAt(i);
    res += code.toString(16).padStart(2, "0").toUpperCase();
  }
  return res;
};

export default function BombGame() {
  const [role, setRole] = useState<"MENU" | "OPERATOR" | "DEFUSER">("MENU");
  const [roomId, setRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState("");
  
  // Game Play States
  const [targetWord, setTargetWord] = useState("CAT");
  const [secretKey, setSecretKey] = useState("BAT");
  const [timeLimit, setTimeLimit] = useState(120);
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameStatus, setGameStatus] = useState<"WAITING" | "PLAYING" | "DEFUSED" | "EXPLODED">("WAITING");

  // Defuser States
  const [cipherHex, setCipherHex] = useState("");
  const [cipherBinary, setCipherBinary] = useState("");
  const [defuserKey, setDefuserKey] = useState("");
  const [defuserInput, setDefuserInput] = useState("");

  const pollInterval = useRef<any>(null);

  // สร้างห้องใหม่
  const createRoom = async (selectedRole: "OPERATOR" | "DEFUSER") => {
    const newId = Math.random().toString(36).substring(2, 6).toUpperCase();
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CREATE", roomId: newId }),
    });
    setRoomId(newId);
    setRole(selectedRole);
  };

  // เข้าห้องที่มีอยู่แล้ว
  const joinRoom = async (selectedRole: "OPERATOR" | "DEFUSER") => {
    if (!inputRoomId.trim()) return alert("กรุณาใส่รหัสห้อง 4 ตัว");
    const code = inputRoomId.trim().toUpperCase();
    const res = await fetch(`/api/room?roomId=${code}`);
    if (res.ok) {
      setRoomId(code);
      setRole(selectedRole);
    } else {
      alert("ไม่พบห้องนี้ กรุณาตรวจสอบรหัสอีกครั้ง");
    }
  };

  // Polling ข้อมูลสถานะห้องแบบ Real-time ทุก 1 วินาที
  useEffect(() => {
    if (!roomId) return;

    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/room?roomId=${roomId}`);
        if (!res.ok) return;
        const data = await res.json();

        setGameStatus(data.status);
        if (data.status === "PLAYING") {
          setCipherHex(data.cipherHex);
          setCipherBinary(data.cipherBinary);
          setDefuserKey(data.secretKey);

          // คำนวณเวลาที่เหลือจาก Server Start Time
          const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
          const remain = Math.max(0, data.timeLimit - elapsed);
          setTimeLeft(remain);

          if (remain === 0 && data.status === "PLAYING") {
            triggerExplode();
          }
        } else if (data.status === "DEFUSED") {
          confetti();
        }
      } catch (err) {
        console.error("Poll error", err);
      }
    };

    fetchRoom();
    pollInterval.current = setInterval(fetchRoom, 1000);
    return () => clearInterval(pollInterval.current);
  }, [roomId]);

  // ฝั่ง Operator ส่งรหัสเริ่มจับเวลา
  const handleArmBomb = async () => {
    if (targetWord.length !== secretKey.length) {
      return alert("ความยาวของคำและ Key ต้องเท่ากัน (เช่น 3 หรือ 4 ตัว)");
    }

    const t = targetWord.toUpperCase();
    const k = secretKey.toUpperCase();
    const hex = xorHex(t, k);

    let bin = "";
    for (let i = 0; i < t.length; i++) {
      bin += (t.charCodeAt(i) ^ k.charCodeAt(i)).toString(2).padStart(8, "0") + " ";
    }

    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ARM",
        roomId,
        data: {
          targetWord: t,
          secretKey: k,
          cipherHex: hex,
          cipherBinary: bin.trim(),
          timeLimit,
        },
      }),
    });
  };

  // ฝั่ง Defuser กดยืนยันตัดวงจร
  const handleDefuse = async () => {
    if (!defuserInput.trim()) return;
    const res = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SUBMIT",
        roomId,
        data: { answer: defuserInput.trim().toUpperCase() },
      }),
    });
    const result = await res.json();
    if (result.isCorrect) {
      confetti();
    }
  };

  const triggerExplode = async () => {
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "EXPLODE", roomId }),
    });
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // -------------------------------------------------------------
  // หน้าจอ MENU (กดง่าย สีชัดเจน รองรับมือถือ)
  // -------------------------------------------------------------
  if (role === "MENU") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-slate-900 border-4 border-slate-700 rounded-xl p-6 sm:p-8 max-w-lg w-full shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-black text-amber-400 tracking-wider mb-2">
              BOMB DEFUSAL : XOR
            </h1>
            <p className="text-slate-300 text-sm">สื่อการสอนถอดรหัสคอมพิวเตอร์ระดับมัธยมปลาย</p>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800 p-4 rounded-lg border-2 border-slate-600">
              <h2 className="text-lg font-bold text-white mb-2">1. สร้างห้องใหม่ (Host Room)</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => createRoom("OPERATOR")}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg shadow-md active:scale-95 transition text-sm"
                >
                  สร้างเป็น [ผู้ตั้งรหัส]
                </button>
                <button
                  onClick={() => createRoom("DEFUSER")}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg shadow-md active:scale-95 transition text-sm"
                >
                  สร้างเป็น [ผู้กู้ระเบิด]
                </button>
              </div>
            </div>

            <div className="bg-slate-800 p-4 rounded-lg border-2 border-slate-600">
              <h2 className="text-lg font-bold text-white mb-2">2. จอยห้องเพื่อน (Join Room)</h2>
              <input
                type="text"
                placeholder="ใส่รหัสห้อง 4 หลัก (เช่น AB12)"
                maxLength={4}
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 text-amber-400 font-mono text-2xl text-center py-2 px-3 rounded border-2 border-slate-600 mb-3 tracking-widest focus:border-amber-400 outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => joinRoom("OPERATOR")}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 px-4 rounded shadow active:scale-95 transition text-sm"
                >
                  จอยเป็น [ผู้ตั้งรหัส]
                </button>
                <button
                  onClick={() => joinRoom("DEFUSER")}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 px-4 rounded shadow active:scale-95 transition text-sm"
                >
                  จอยเป็น [ผู้กู้ระเบิด]
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // หน้าจอ BOMB OPERATOR (คนคิดคำและส่ง XOR)
  // -------------------------------------------------------------
  if (role === "OPERATOR") {
    return (
      <main className="min-h-screen p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-xl bg-slate-900 border-4 border-slate-700 rounded-xl p-6 shadow-2xl">
          <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-6">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">ห้องปฏิบัติการ</span>
              <span className="text-2xl font-bold text-amber-400 font-mono tracking-widest">ROOM: {roomId}</span>
            </div>
            <button
              onClick={() => setRole("MENU")}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-1 px-3 rounded border border-slate-600"
            >
              ออกจากห้อง
            </button>
          </div>

          <h2 className="text-xl font-bold text-red-400 mb-4">ตั้งค่ารหัสระเบิด (Operator Station)</h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm text-slate-300 mb-1 font-semibold">
                คำศัพท์ลับ (Original Word 3-4 ตัวอักษร):
              </label>
              <input
                type="text"
                maxLength={4}
                disabled={gameStatus === "PLAYING"}
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border-2 border-slate-600 rounded p-2 text-2xl text-emerald-400 font-mono text-center tracking-widest"
              />
              <div className="text-xs text-slate-400 mt-1 code-font">
                ASCII Bit: {toBinary(targetWord)}
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1 font-semibold">
                กุญแจเข้ารหัส (Key ต้องยาวเท่าคำศัพท์):
              </label>
              <input
                type="text"
                maxLength={4}
                disabled={gameStatus === "PLAYING"}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border-2 border-slate-600 rounded p-2 text-2xl text-cyan-400 font-mono text-center tracking-widest"
              />
              <div className="text-xs text-slate-400 mt-1 code-font">
                ASCII Bit: {toBinary(secretKey)}
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1 font-semibold">
                เวลาให้กู้ระเบิด:
              </label>
              <select
                disabled={gameStatus === "PLAYING"}
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-full bg-slate-950 border-2 border-slate-600 rounded p-2 text-white font-mono"
              >
                <option value={60}>60 วินาที (1 นาที)</option>
                <option value={120}>120 วินาที (2 นาที)</option>
                <option value={180}>180 วินาที (3 นาที)</option>
              </select>
            </div>
          </div>

          {gameStatus === "WAITING" && (
            <button
              onClick={handleArmBomb}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-lg text-xl tracking-wider shadow-lg active:scale-95 transition"
            >
              🚀 ส่งรหัส & เริ่มจับเวลาทันที
            </button>
          )}

          {gameStatus === "PLAYING" && (
            <div className="bg-slate-950 border-2 border-red-500 rounded-lg p-5 text-center">
              <div className="text-xs text-red-400 mb-1 animate-pulse">BOMB ARMED - ระเบิดกำลังนับถอยหลัง</div>
              <div className="text-5xl font-mono text-red-500 font-bold tracking-widest mb-3">
                {formatTimer(timeLeft)}
              </div>
              <p className="text-slate-400 text-sm">รออีกฝั่งทำการคำนวณและกู้ระเบิด...</p>
            </div>
          )}

          {gameStatus === "DEFUSED" && (
            <div className="bg-emerald-950 border-2 border-emerald-500 rounded-lg p-4 text-center text-emerald-300 font-bold text-lg">
              🎉 อีกฝั่งกู้ระเบิดสำเร็จ! คำตอบถูกต้อง
            </div>
          )}

          {gameStatus === "EXPLODED" && (
            <div className="bg-red-950 border-2 border-red-600 rounded-lg p-4 text-center text-red-400 font-bold text-lg animate-bounce">
              💥 ตู้มม! ระเบิดทำงาน อีกฝั่งตอบผิดหรือหมดเวลา!
            </div>
          )}
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // หน้าจอ DEFUSER : THE BOMB CASING (Keep Talking and Nobody Explodes)
  // -------------------------------------------------------------
  return (
    <main className="min-h-screen p-2 sm:p-6 flex flex-col items-center justify-center">
      {/* ส่วนหัวแสดงผลห้อง */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-3 px-2 text-slate-300">
        <div className="text-sm font-semibold">
          ROOM: <span className="text-amber-400 font-mono text-lg">{roomId}</span>
        </div>
        <button
          onClick={() => setRole("MENU")}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-1 px-3 rounded border border-slate-600"
        >
          กลับหน้าหลัก
        </button>
      </div>

      {/* กรอบเคสระเบิดเหล็ก KTaNE */}
      <div className="bomb-casing p-4 sm:p-6 max-w-4xl w-full">
        {/* แผงโมดูล 6 ช่องแบบในเกม */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* โมดูลที่ 1: นาฬิกา 7-Segment นับเวลาถอยหลัง (Timer Module) */}
          <div className="bomb-module p-5 flex flex-col items-center justify-center min-h-[160px]">
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest font-mono">COUNTDOWN</div>
            <div className="led-timer text-5xl sm:text-6xl font-black py-2 px-4 rounded border-2 border-zinc-800">
              {formatTimer(timeLeft)}
            </div>
            <div className="flex gap-2 mt-3 items-center">
              <span className="text-xs text-slate-400 font-mono">STRIKE:</span>
              <div className={`w-3 h-3 rounded-full ${gameStatus === "EXPLODED" ? "bg-red-600 animate-ping" : "bg-zinc-700"}`} />
              <div className={`w-3 h-3 rounded-full ${gameStatus === "DEFUSED" ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-zinc-700"}`} />
            </div>
          </div>

          {/* โมดูลที่ 2: โมดูลหลอดไฟนีออน / ความถี่สัญญาณ (Hex Cipher Signal) */}
          <div className="bomb-module p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 font-mono">FREQ / CIPHER</span>
              <div className="w-8 h-2 rounded-full bg-amber-500 neon-indicator animate-pulse" />
            </div>
            
            <div className="bg-black border border-zinc-700 rounded p-2 text-center my-auto">
              <div className="text-[10px] text-zinc-400 mb-1">CIPHERTEXT (HEX)</div>
              <div className="text-2xl font-mono font-bold text-amber-400 tracking-widest">
                {cipherHex || "-- --"}
              </div>
            </div>

            <div className="bg-zinc-950 p-1.5 rounded text-[10px] font-mono text-zinc-400 break-all text-center mt-2">
              BIT: {cipherBinary || "---- ---- ----"}
            </div>
          </div>

          {/* โมดูลที่ 3: โมดูลรับ Key (Given Key Module) */}
          <div className="bomb-module p-4 flex flex-col justify-between">
            <span className="text-xs text-slate-400 font-mono">INTERCEPTED KEY</span>
            
            <div className="bg-black border border-zinc-700 rounded p-3 text-center my-auto">
              <div className="text-[10px] text-zinc-400 mb-1">SECRET KEY</div>
              <div className="text-3xl font-mono font-bold text-cyan-400 tracking-widest">
                {defuserKey || "----"}
              </div>
            </div>

            <div className="bg-zinc-950 p-1.5 rounded text-[10px] font-mono text-zinc-400 break-all text-center mt-2">
              BIT: {defuserKey ? toBinary(defuserKey) : "---- ---- ----"}
            </div>
          </div>

          {/* โมดูลที่ 4: แผงวงจรสายไฟและกฎ XOR (XOR Truth Table Reference) */}
          <div className="bomb-module p-4 flex flex-col justify-between">
            <span className="text-xs text-slate-400 font-mono mb-2">LOGIC WIRE MATRIX</span>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-black p-2.5 rounded border border-zinc-800 text-slate-300">
              <div>0 ⊕ 0 = <span className="text-emerald-400 font-bold">0</span></div>
              <div>0 ⊕ 1 = <span className="text-amber-400 font-bold">1</span></div>
              <div>1 ⊕ 0 = <span className="text-amber-400 font-bold">1</span></div>
              <div>1 ⊕ 1 = <span className="text-emerald-400 font-bold">0</span></div>
            </div>
            <div className="text-[10px] text-slate-400 text-center mt-2">
              สูตร: คำตอบ = Cipher ⊕ Key
            </div>
          </div>

          {/* โมดูลที่ 5 & 6 รวมกัน: ปุ่มปลดชนวนใหญ่ (Big Defusal Button + Input) */}
          <div className="bomb-module md:col-span-2 p-5 flex flex-col justify-between bg-zinc-900">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-300 font-mono">MANUAL DISARM CONSOLE</span>
              <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                gameStatus === "PLAYING" ? "bg-red-900 text-red-300 animate-pulse" :
                gameStatus === "DEFUSED" ? "bg-emerald-900 text-emerald-300" :
                gameStatus === "EXPLODED" ? "bg-red-900 text-red-300" : "bg-zinc-800 text-zinc-400"
              }`}>
                STATUS: {gameStatus}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-center my-auto py-2">
              <div className="w-full sm:w-1/2">
                <label className="text-[11px] text-slate-400 block mb-1">
                  กรอกคำศัพท์ที่ถอดรหัสได้ (3-4 ตัวอักษร):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  disabled={gameStatus !== "PLAYING"}
                  value={defuserInput}
                  onChange={(e) => setDefuserInput(e.target.value.toUpperCase())}
                  placeholder="เช่น CAT"
                  className="w-full bg-black border-2 border-zinc-700 text-amber-400 font-mono text-3xl text-center py-2 rounded focus:border-red-500 outline-none tracking-widest font-bold"
                />
              </div>

              {/* ปุ่มใหญ่คล้ายปุ่ม DETONATE/HOLD ใน KTaNE */}
              <div className="w-full sm:w-1/2">
                <button
                  onClick={handleDefuse}
                  disabled={gameStatus !== "PLAYING"}
                  className={`w-full py-4 rounded-xl font-black text-xl tracking-widest shadow-xl transition-all ${
                    gameStatus === "PLAYING"
                      ? "bg-gradient-to-b from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white cursor-pointer active:scale-95 border-2 border-red-500"
                      : "bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed"
                  }`}
                >
                  CUT WIRE / DEFUSE
                </button>
              </div>
            </div>

            {/* ผลการกู้ระเบิด */}
            {gameStatus === "DEFUSED" && (
              <div className="bg-emerald-500 text-black font-black text-center py-2 rounded mt-2 text-sm tracking-wider">
                *** BOMB DEFUSED! ภารกิจสำเร็จ กู้ระเบิดได้ทันเวลา ***
              </div>
            )}
            {gameStatus === "EXPLODED" && (
              <div className="bg-red-600 text-white font-black text-center py-2 rounded mt-2 text-sm tracking-wider animate-bounce">
                *** DETONATED! ระเบิดทำงาน คำตอบไม่ถูกต้องหรือเวลาหมด ***
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}