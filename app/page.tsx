"use client";

import React, { useState, useEffect, useRef } from "react";

const toAsciiBinArray = (char: string): number[] => {
  if (!char) return [0, 0, 0, 0, 0, 0, 0, 0];
  return char
    .charCodeAt(0)
    .toString(2)
    .padStart(8, "0")
    .split("")
    .map(Number);
};

export default function BombWorkshopApp() {
  const [role, setRole] = useState<"MENU" | "OPERATOR_SETUP" | "OPERATOR_LOBBY" | "DEFUSER">("MENU");
  const [roomId, setRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState("");

  // Game Settings & Room Status
  const [targetWord, setTargetWord] = useState("CAT");
  const [secretKey, setSecretKey] = useState("BAT");
  const [timeLimit, setTimeLimit] = useState(120);
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameStatus, setGameStatus] = useState<"LOBBY" | "PLAYING" | "DEFUSED" | "EXPLODED">("LOBBY");
  const [defuserJoined, setDefuserJoined] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Defuser Gameplay (Interactive XOR Bit Switcher)
  const [defuserKey, setDefuserKey] = useState("");
  const [cipherHex, setCipherHex] = useState("");
  const [cipherBytes, setCipherBytes] = useState<number[][]>([]);
  const [keyBytes, setKeyBytes] = useState<number[][]>([]);
  
  // สถานะบิตที่เลือก
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [userBits, setUserBits] = useState<number[][]>([[0,0,0,0,0,0,0,0]]);

  const pollInterval = useRef<any>(null);

  // คำนวณคำที่แปลงได้จากบิตปัจจุบัน
  const currentDecodedWord = userBits
    .map((byte) => {
      const code = parseInt(byte.join(""), 2);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : "?";
    })
    .join("");

  // 1. ผู้ตั้งรหัสกดสร้างห้อง
  const handleSaveAndCreateRoom = async () => {
    const t = targetWord.trim().toUpperCase();
    const k = secretKey.trim().toUpperCase();

    if (!t || !k) return alert("กรุณากรอกทั้งคำศัพท์และ Key");
    if (t.length !== k.length) return alert("คำศัพท์และ Key ต้องมีความยาวเท่ากัน!");

    setIsSubmitting(true);
    const newId = Math.random().toString(36).substring(2, 6).toUpperCase();

    let hex = "";
    for (let i = 0; i < t.length; i++) {
      hex += (t.charCodeAt(i) ^ k.charCodeAt(i)).toString(16).padStart(2, "0").toUpperCase();
    }

    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CREATE", roomId: newId }),
      });

      if (res.ok) {
        setRoomId(newId);
        setCipherHex(hex);
        setRole("OPERATOR_LOBBY");
      }
    } catch {
      alert("เชื่อมต่อเซิร์ฟเวอร์ขัดข้อง");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. ผู้กู้ระเบิดกดเข้าห้อง
  const handleJoinRoom = async () => {
    if (!inputRoomId.trim()) return alert("กรุณาใส่รหัสห้อง 4 หลัก");
    const code = inputRoomId.trim().toUpperCase();

    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "JOIN", roomId: code }),
      });

      if (res.ok) {
        setRoomId(code);
        setRole("DEFUSER");
      } else {
        alert("ไม่พบรหัสห้องนี้ กรุณาตรวจสอบอีกครั้ง");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  // ดึงข้อมูล Realtime จาก Server
  useEffect(() => {
    if (!roomId || role === "MENU" || role === "OPERATOR_SETUP") return;

    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/room?roomId=${roomId}`);
        if (!res.ok) return;
        const data = await res.json();

        setGameStatus(data.status);
        setDefuserJoined(Boolean(data.defuserJoined));

        if (data.status === "PLAYING") {
          setDefuserKey(data.secretKey);
          setCipherHex(data.cipherHex);

          if (data.cipherHex && cipherBytes.length === 0) {
            const cBytes: number[][] = [];
            for (let i = 0; i < data.cipherHex.length; i += 2) {
              const val = parseInt(data.cipherHex.substr(i, 2), 16);
              cBytes.push(val.toString(2).padStart(8, "0").split("").map(Number));
            }
            setCipherBytes(cBytes);

            const kBytes = data.secretKey.split("").map((c: string) => toAsciiBinArray(c));
            setKeyBytes(kBytes);

            setUserBits(cBytes.map(() => [0, 0, 0, 0, 0, 0, 0, 0]));
          }

          const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
          const remain = Math.max(0, data.timeLimit - elapsed);
          setTimeLeft(remain);

          if (remain === 0 && data.status === "PLAYING") {
            triggerExplode();
          }
        }
      } catch (err) {
        console.error("Poll error", err);
      }
    };

    fetchRoom();
    pollInterval.current = setInterval(fetchRoom, 1000);
    return () => clearInterval(pollInterval.current);
  }, [roomId, role, cipherBytes.length]);

  // ผู้ตั้งรหัสกดปล่อยระเบิด
  const handleArmBomb = async () => {
    if (!defuserJoined) return alert("รอให้อีกฝ่ายจอยเข้าห้องก่อนครับ");

    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ARM",
        roomId,
        data: {
          targetWord: targetWord.trim().toUpperCase(),
          secretKey: secretKey.trim().toUpperCase(),
          cipherHex,
          timeLimit,
        },
      }),
    });
  };

  // แตะเพื่อสลับบิต (0 <-> 1)
  const toggleBit = (bitIndex: number) => {
    if (gameStatus !== "PLAYING") return;
    setUserBits((prev) => {
      const next = prev.map((arr) => [...arr]);
      next[activeCharIndex][bitIndex] = next[activeCharIndex][bitIndex] === 0 ? 1 : 0;
      return next;
    });
  };

  // กดยืนยันตัดวงจรด้วยบิตที่เซ็ตไว้
  const handleExecuteDefuse = async () => {
    if (gameStatus !== "PLAYING") return;
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SUBMIT",
        roomId,
        data: { answer: currentDecodedWord },
      }),
    });
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

  // =========================================================================
  // 1. หน้าจอ MENU
  // =========================================================================
  if (role === "MENU") {
    return (
      <main className="min-h-screen p-4 sm:p-8 flex items-center justify-center bg-[#1a212d]">
        <div className="folder-cover p-4 sm:p-10 max-w-2xl w-full relative">
          <div className="absolute top-2 right-16 w-6 h-14 border-4 border-slate-400 rounded-full z-20 pointer-events-none opacity-80" />

          <div className="folder-paper p-6 sm:p-10 rounded-sm text-slate-800 border-l-4 border-amber-800/20">
            <div className="border-b-2 border-dashed border-slate-400 pb-4 mb-6 text-center">
              <h1 className="text-3xl sm:text-4xl font-black tracking-widest text-slate-900 mb-1">
                TOP SECRET : XOR PROJECT
              </h1>
              <p className="text-xs uppercase tracking-widest text-slate-500 font-sans">
                คู่มือภารกิจกู้ระเบิดคอมพิวเตอร์ระดับมัธยมศึกษา
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6 font-sans">
              <div className="bg-amber-50/80 p-5 rounded border border-amber-300 flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[11px] font-bold text-red-600 tracking-wider uppercase block mb-1">
                    AGENT 01
                  </span>
                  <h2 className="text-xl font-black text-slate-900 mb-1 font-serif">ผู้ตั้งรหัสลับ</h2>
                  <p className="text-xs text-slate-600 mb-4 font-mono leading-relaxed">
                    กำหนด Keyword ภาษาอังกฤษ และ Secret Key เพื่อสร้างภารกิจให้เพื่อน
                  </p>
                </div>
                <button
                  onClick={() => setRole("OPERATOR_SETUP")}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded shadow active:scale-95 transition text-sm tracking-wider uppercase"
                >
                  + สร้างภารกิจใหม่
                </button>
              </div>

              <div className="bg-blue-50/80 p-5 rounded border border-blue-300 flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[11px] font-bold text-blue-600 tracking-wider uppercase block mb-1">
                    AGENT 02
                  </span>
                  <h2 className="text-xl font-black text-slate-900 mb-1 font-serif">ผู้ปลดชนวน</h2>
                  <p className="text-xs text-slate-600 mb-3 font-mono leading-relaxed">
                    กรอกรหัส 4 หลักที่ได้จากคู่หู เพื่อเปิดเข้าเคสระเบิด XOR
                  </p>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="รหัสห้อง 4 หลัก"
                    value={inputRoomId}
                    onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                    className="w-full bg-white text-slate-900 font-mono text-center text-xl py-2 px-3 rounded border-2 border-slate-400 mb-3 tracking-widest uppercase focus:border-blue-600 outline-none"
                  />
                </div>
                <button
                  onClick={handleJoinRoom}
                  className="w-full bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded shadow active:scale-95 transition text-sm tracking-wider uppercase"
                >
                  เข้าสู่ห้องกู้ระเบิด
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 text-center font-mono mt-4 pt-4 border-t border-slate-300">
              CLASSIFIED WORKSHOP MATERIAL — ห้ามเผยแพร่คำตอบก่อนเริ่มภารกิจ
            </div>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 2. หน้าจอ OPERATOR SETUP
  // =========================================================================
  if (role === "OPERATOR_SETUP") {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center bg-[#1a212d]">
        <div className="folder-cover p-4 sm:p-8 max-w-lg w-full">
          <div className="folder-paper p-6 rounded text-slate-900">
            <div className="flex justify-between items-center border-b pb-3 mb-5 border-slate-300">
              <h2 className="text-2xl font-black font-serif">ตั้งค่าภารกิจรหัสลับ</h2>
              <button
                onClick={() => setRole("MENU")}
                className="text-xs text-slate-600 underline font-sans hover:text-black"
              >
                ย้อนกลับ
              </button>
            </div>

            <div className="space-y-4 mb-6 font-sans">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  1. คำศัพท์ภาษาอังกฤษ (3-4 ตัวอักษร):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={targetWord}
                  onChange={(e) => setTargetWord(e.target.value.toUpperCase())}
                  className="w-full bg-white border-2 border-slate-400 rounded p-2 text-2xl font-mono text-center tracking-widest font-black uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  2. กุญแจ Key (ความยาวเท่าคำศัพท์):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                  className="w-full bg-white border-2 border-slate-400 rounded p-2 text-2xl font-mono text-center tracking-widest font-black uppercase text-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  3. เวลานับถอยหลัง:
                </label>
                <select
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                  className="w-full bg-white border-2 border-slate-400 rounded p-2 text-base font-sans"
                >
                  <option value={60}>60 วินาที (1 นาที)</option>
                  <option value={120}>120 วินาที (2 นาที)</option>
                  <option value={180}>180 วินาที (3 นาที)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSaveAndCreateRoom}
              disabled={isSubmitting}
              className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3.5 rounded shadow active:scale-95 transition tracking-wider uppercase font-sans"
            >
              {isSubmitting ? "กำลังเปิดห้อง..." : "✓ ยืนยันรหัส & เปิดห้องภารกิจ"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 3. หน้าจอ OPERATOR LOBBY
  // =========================================================================
  if (role === "OPERATOR_LOBBY") {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center bg-[#1a212d]">
        <div className="folder-cover p-4 sm:p-8 max-w-md w-full">
          <div className="folder-paper p-6 rounded text-slate-900 text-center font-sans">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
              แจ้งรหัสนี้ให้ผู้กู้ระเบิด
            </span>
            <div className="text-5xl font-black font-mono tracking-widest my-3 text-red-600">
              {roomId}
            </div>

            <div className={`p-3 rounded-lg mb-6 text-sm font-bold border ${
              defuserJoined 
                ? "bg-emerald-100 border-emerald-500 text-emerald-800" 
                : "bg-amber-100 border-amber-500 text-amber-800 animate-pulse"
            }`}>
              {defuserJoined ? "✓ คู่หูเชื่อมต่อเข้าสู่ห้องแล้ว!" : "⏳ รอคู่หูกรอกรหัสห้องเข้ามา..."}
            </div>

            {gameStatus === "LOBBY" && (
              <button
                onClick={handleArmBomb}
                disabled={!defuserJoined}
                className={`w-full py-4 rounded-lg font-black tracking-wider text-base uppercase transition ${
                  defuserJoined
                    ? "bg-red-600 hover:bg-red-500 text-white shadow-lg active:scale-95 cursor-pointer"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed"
                }`}
              >
                {defuserJoined ? "🚀 เริ่มนับเวลาถอยหลังทันที" : "รอผู้กู้ระเบิดเข้าห้องก่อน"}
              </button>
            )}

            {gameStatus === "PLAYING" && (
              <div className="bg-slate-900 text-white p-4 rounded-lg font-mono">
                <span className="text-xs text-red-400 block mb-1">DETONATION TIMER</span>
                <span className="text-4xl text-red-500 font-bold">{formatTimer(timeLeft)}</span>
              </div>
            )}

            {gameStatus === "DEFUSED" && (
              <div className="mt-4 p-3 bg-emerald-600 text-white font-bold rounded">
                ภารกิจสำเร็จ! อีกฝั่งกู้ระเบิดได้ถูกต้อง
              </div>
            )}

            {gameStatus === "EXPLODED" && (
              <div className="mt-4 p-3 bg-red-600 text-white font-bold rounded">
                ระเบิดทำงาน! อีกฝ่ายตอบผิดหรือเวลาหมด
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 4. หน้าจอ DEFUSER : เคสระเบิดการ์ตูน KTaNE โมเดิร์น
  // =========================================================================
  return (
    <main className="min-h-screen p-3 sm:p-6 flex flex-col items-center justify-center bg-[#151a22]">
      <div className="w-full max-w-4xl flex justify-between items-center mb-3 px-2 text-slate-300">
        <div className="text-sm font-semibold tracking-wider">
          DEFUSAL ROOM: <span className="text-cyan-400 font-mono text-lg font-bold">{roomId}</span>
        </div>
        <button
          onClick={() => { setRoomId(""); setRole("MENU"); }}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 px-3 rounded"
        >
          กลับหน้าหลัก
        </button>
      </div>

      {gameStatus === "LOBBY" ? (
        <div className="cartoon-bomb-casing p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-black text-slate-800 mb-1">เชื่อมต่อเคสระเบิดสำเร็จ</h2>
          <p className="text-slate-600 text-sm">กำลังรอให้ผู้ตั้งรหัสกดยืนยันเริ่มปล่อยสัญญาณ...</p>
        </div>
      ) : (
        <div className="cartoon-bomb-casing p-4 sm:p-7 max-w-4xl w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* โมดูลที่ 1: Timer */}
            <div className="cartoon-module p-4 flex flex-col items-center justify-center min-h-[150px]">
              <div className="cartoon-bolt absolute top-2 left-2" />
              <div className="cartoon-bolt absolute top-2 right-2" />
              <span className="text-[10px] font-bold text-slate-600 tracking-widest uppercase mb-1">
                DETONATION COUNTDOWN
              </span>
              <div className="ktane-timer-screen text-5xl sm:text-6xl font-black px-6 py-2 tracking-widest my-auto">
                {formatTimer(timeLeft)}
              </div>
              <div className="flex gap-2 items-center mt-2">
                <span className="text-[10px] font-bold text-slate-500">STATUS:</span>
                <span className={`text-xs font-bold uppercase ${
                  gameStatus === "PLAYING" ? "text-amber-600" :
                  gameStatus === "DEFUSED" ? "text-emerald-600" : "text-red-600"
                }`}>
                  {gameStatus}
                </span>
              </div>
            </div>

            {/* โมดูลที่ 2: Radio Receiver */}
            <div className="cartoon-module p-4 flex flex-col justify-between">
              <div className="cartoon-bolt absolute top-2 left-2" />
              <div className="cartoon-bolt absolute top-2 right-2" />
              
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  RADIO RECEIVER
                </span>
                <div className="w-10 h-3 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full border border-amber-800 shadow-[0_0_8px_#f59e0b] animate-pulse" />
              </div>

              <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-2.5 my-auto text-center">
                <div className="text-[10px] text-slate-400 uppercase">INTERCEPTED CIPHER (HEX)</div>
                <div className="text-2xl font-mono font-black text-amber-400 tracking-widest">
                  {cipherHex || "--"}
                </div>
                <div className="text-[10px] text-slate-400 uppercase mt-1">GIVEN SECRET KEY</div>
                <div className="text-xl font-mono font-black text-cyan-400 tracking-widest">
                  {defuserKey || "----"}
                </div>
              </div>
            </div>

            {/* โมดูลที่ 3: Logic Wire */}
            <div className="cartoon-module p-4 flex flex-col justify-between">
              <div className="cartoon-bolt absolute top-2 left-2" />
              <div className="cartoon-bolt absolute top-2 right-2" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                XOR LOGIC GATE MATRIX
              </span>
              <div className="bg-slate-800 text-slate-200 p-2.5 rounded-lg border-2 border-slate-600 text-xs font-mono space-y-1">
                <div className="flex justify-between"><span>0 ⊕ 0 =</span><span className="text-cyan-400 font-bold">0</span></div>
                <div className="flex justify-between"><span>0 ⊕ 1 =</span><span className="text-amber-400 font-bold">1</span></div>
                <div className="flex justify-between"><span>1 ⊕ 0 =</span><span className="text-amber-400 font-bold">1</span></div>
                <div className="flex justify-between"><span>1 ⊕ 1 =</span><span className="text-cyan-400 font-bold">0</span></div>
              </div>
              <div className="text-[10px] text-slate-600 text-center font-bold">
                Output Bit = CipherBit ⊕ KeyBit
              </div>
            </div>

            {/* โมดูลที่ 4: INTERACTIVE XOR BIT TERMINAL */}
            <div className="cartoon-module md:col-span-3 p-5 bg-[#0f1723] text-white">
              <div className="cartoon-bolt absolute top-2 left-2" />
              <div className="cartoon-bolt absolute top-2 right-2" />

              <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">CHAR SELECT:</span>
                  <div className="flex gap-2">
                    {userBits.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveCharIndex(idx)}
                        className={`px-3 py-1 rounded text-xs font-mono font-bold transition ${
                          activeCharIndex === idx
                            ? "bg-cyan-500 text-slate-950 shadow-[0_0_10px_#00f0ff]"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        CHAR {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs font-mono">
                  DECODED WORD: <span className="text-xl font-bold text-emerald-400 ml-1 font-sans">{currentDecodedWord}</span>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-2 my-3">
                <div className="text-center w-full max-w-md">
                  <span className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase mb-1">
                    INPUT A (CIPHER BITS)
                  </span>
                  <div className="bg-[#101b2b] border border-cyan-800 text-cyan-300 font-mono text-xl py-2 px-4 rounded tracking-[0.3em] font-black shadow-inner">
                    {cipherBytes[activeCharIndex]?.join("") || "00000000"}
                  </div>
                </div>

                <div className="my-1 bg-[#1a2332] border border-purple-500/50 text-purple-300 font-mono text-xs font-bold px-4 py-1 rounded-full shadow-[0_0_12px_rgba(168,85,247,0.4)]">
                  ↓ XOR GATE ↓
                </div>

                {/* จุดที่แก้ Error: ใช้ JavaScript string quotes ธรรมดาใน JSX */}
                <div className="text-center w-full max-w-md">
                  <span className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase mb-1">
                    {`INPUT B (KEY BITS: '${defuserKey[activeCharIndex] || "?"}')`}
                  </span>
                  <div className="bg-[#101b2b] border border-cyan-800 text-cyan-300 font-mono text-xl py-2 px-4 rounded tracking-[0.3em] font-black shadow-inner">
                    {keyBytes[activeCharIndex]?.join("") || "00000000"}
                  </div>
                </div>

                <div className="w-full text-center mt-3">
                  <span className="text-xs text-amber-400 font-bold block mb-2 animate-pulse">
                    แตะบิตด้านล่างเพื่อเปลี่ยน OUTPUT (0 ⇄ 1)
                  </span>

                  <div className="flex justify-center gap-1 sm:gap-3 flex-wrap">
                    {userBits[activeCharIndex]?.map((bit, bitIdx) => (
                      <button
                        key={bitIdx}
                        onClick={() => toggleBit(bitIdx)}
                        className={`bit-toggle-btn w-9 h-12 sm:w-11 sm:h-14 text-2xl font-black rounded-lg cursor-pointer ${
                          bit === 1 ? "active" : ""
                        }`}
                      >
                        {bit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800">
                <button
                  onClick={handleExecuteDefuse}
                  disabled={gameStatus !== "PLAYING"}
                  className={`w-full py-4 rounded-xl font-black text-xl uppercase tracking-widest shadow-xl transition active:scale-95 ${
                    gameStatus === "PLAYING"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                      : "bg-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  ⚡ EXECUTE DEFUSE (ปลดชนวนระเบิด)
                </button>
              </div>

              {gameStatus === "DEFUSED" && (
                <div className="mt-4 p-4 bg-emerald-500 text-slate-950 font-black text-center text-xl rounded-lg tracking-wider">
                  {`MISSION SUCCESS! กู้ระเบิดสำเร็จ คำตอบคือ "${currentDecodedWord}"`}
                </div>
              )}
              {gameStatus === "EXPLODED" && (
                <div className="mt-4 p-4 bg-red-600 text-white font-black text-center text-xl rounded-lg tracking-wider">
                  MISSION FAILED! ระเบิดทำงาน ถอดรหัสผิดพลาดหรือหมดเวลา
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </main>
  );
}