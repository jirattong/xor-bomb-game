"use client";

import React, { useState, useEffect, useRef } from "react";

// ฟังก์ชันแปลงตัวอักษร 1 ตัวเป็น Binary Array 8 หลัก
const charTo8Bits = (char: string): number[] => {
  if (!char) return [0, 0, 0, 0, 0, 0, 0, 0];
  return char
    .charCodeAt(0)
    .toString(2)
    .padStart(8, "0")
    .split("")
    .map(Number);
};

// ฟังก์ชันแปลงเลขฐาน 16 (Hex 2 หลัก) เป็น Binary Array 8 หลัก
const hexByteTo8Bits = (hexByte: string): number[] => {
  const val = parseInt(hexByte, 16);
  if (isNaN(val)) return [0, 0, 0, 0, 0, 0, 0, 0];
  return val.toString(2).padStart(8, "0").split("").map(Number);
};

export default function BombWorkshopGame() {
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

  // Defuser Gameplay (Bit Toggling)
  const [defuserKey, setDefuserKey] = useState("");
  const [cipherHex, setCipherHex] = useState("");
  const [cipherBitsMatrix, setCipherBitsMatrix] = useState<number[][]>([]);
  const [keyBitsMatrix, setKeyBitsMatrix] = useState<number[][]>([]);
  
  // บิตของแต่ละตัวอักษร (แถว = ตัวอักษร, คอลัมน์ = บิต 0-7)
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [userBitsMatrix, setUserBitsMatrix] = useState<number[][]>([[0,0,0,0,0,0,0,0]]);

  // คำนวณคำศัพท์ที่ผู้เล่นกำลังถอดรหัสอยู่แบบ Realtime
  const currentDecodedWord = userBitsMatrix
    .map((byte) => {
      const ascii = parseInt(byte.join(""), 2);
      return ascii >= 32 && ascii <= 126 ? String.fromCharCode(ascii) : "?";
    })
    .join("");

  // 1. ผู้ตั้งรหัสบันทึกและสร้างห้อง
  const handleSaveAndCreateRoom = async () => {
    const t = (targetWord || "CAT").trim().toUpperCase();
    const k = (secretKey || "BAT").trim().toUpperCase();

    if (!t || !k) return alert("กรุณากรอกทั้งคำศัพท์และ Key");
    if (t.length !== k.length) return alert("คำศัพท์และ Key ต้องมีความยาวเท่ากัน!");

    setIsSubmitting(true);
    const newId = Math.random().toString(36).substring(2, 6).toUpperCase();

    // เข้ารหัส XOR แปลงเป็น Hex 2 หลักต่อ 1 ตัวอักษรเสมอ (Zero Padded)
    let hex = "";
    for (let i = 0; i < t.length; i++) {
      const xorVal = t.charCodeAt(i) ^ k.charCodeAt(i);
      hex += xorVal.toString(16).padStart(2, "0").toUpperCase();
    }

    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CREATE", roomId: newId }),
      });

      if (res.ok) {
        setRoomId(newId);
        setTargetWord(t);
        setSecretKey(k);
        setCipherHex(hex);
        setRole("OPERATOR_LOBBY");
      } else {
        alert("ไม่สามารถสร้างห้องได้ กรุณาลองใหม่อีกครั้ง");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. ผู้กู้ระเบิดจอยเข้าห้อง
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
        alert("ไม่พบรหัสห้องนี้ (ตรวจสอบว่าผู้สร้างกดสร้างห้องแล้วหรือยัง)");
      }
    } catch {
      alert("เชื่อมต่อเซิร์ฟเวอร์ขัดข้อง");
    }
  };

  // Polling ตรวจสอบสถานะห้องแบบไม่ค้าง
  useEffect(() => {
    if (!roomId || role === "MENU" || role === "OPERATOR_SETUP") return;

    let isMounted = true;
    let timeoutId: any = null;

    const pollRoom = async () => {
      try {
        const res = await fetch(`/api/room?roomId=${roomId}&_t=${Date.now()}`, {
          cache: "no-store",
        });

        if (res.ok && isMounted) {
          const data = await res.json();

          setGameStatus(data.status);
          setDefuserJoined(Boolean(data.defuserJoined));

          if (data.status === "PLAYING") {
            setDefuserKey(data.secretKey);
            setCipherHex(data.cipherHex);

            // แปลง Hex และ Key เป็น Bit Arrays ถ้ายังไม่ได้ตั้งค่า
            if (data.cipherHex && cipherBitsMatrix.length === 0) {
              const hexStr = data.cipherHex;
              const cMatrix: number[][] = [];
              for (let i = 0; i < hexStr.length; i += 2) {
                const byteHex = hexStr.substr(i, 2);
                cMatrix.push(hexByteTo8Bits(byteHex));
              }
              setCipherBitsMatrix(cMatrix);

              const kMatrix = data.secretKey.split("").map((c: string) => charTo8Bits(c));
              setKeyBitsMatrix(kMatrix);

              // ตั้งบิตเริ่มต้นของแต่ละตัวอักษรเป็น 0 ทั้งหมด
              setUserBitsMatrix(cMatrix.map(() => [0, 0, 0, 0, 0, 0, 0, 0]));
            }

            const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
            const remain = Math.max(0, data.timeLimit - elapsed);
            setTimeLeft(remain);

            if (remain === 0 && data.status === "PLAYING") {
              triggerExplode();
            }
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      } finally {
        if (isMounted) {
          timeoutId = setTimeout(pollRoom, 1000);
        }
      }
    };

    pollRoom();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [roomId, role, cipherBitsMatrix.length]);

  // ผู้ตั้งรหัสกดเริ่มนับเวลา
  const handleArmBomb = async () => {
    if (!defuserJoined) return alert("รอให้ผู้กู้ระเบิดเข้าห้องก่อนครับ");

    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ARM",
        roomId,
        data: {
          targetWord,
          secretKey,
          cipherHex,
          timeLimit,
        },
      }),
    });
  };

  // แตะเพื่อสลับบิต (0 ⇄ 1)
  const toggleBit = (bitIndex: number) => {
    if (gameStatus !== "PLAYING") return;
    setUserBitsMatrix((prev) => {
      const next = prev.map((row) => [...row]);
      next[activeCharIndex][bitIndex] = next[activeCharIndex][bitIndex] === 0 ? 1 : 0;
      return next;
    });
  };

  // กดยืนยันตัดวงจร
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
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="vault-container p-6 sm:p-10 max-w-lg">
          <div className="brass-screw absolute top-3 left-3" />
          <div className="brass-screw absolute top-3 right-3" />
          <div className="brass-screw absolute bottom-3 left-3" />
          <div className="brass-screw absolute bottom-3 right-3" />

          <div className="hazard-stripe h-4 w-full mb-6" />

          <div className="text-center mb-8">
            <span className="bg-amber-500 text-black font-black text-xs px-4 py-1 rounded-full uppercase tracking-widest">
              XOR CIPHER PROTOCOL
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-wider mt-3">
              BOMB DEFUSAL
            </h1>
            <p className="text-sm font-semibold text-slate-400 mt-1">
              เวิร์กช็อปเกมถอดรหัสบิตระดับมัธยมปลาย
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border-2 border-amber-500/60 rounded-2xl p-5">
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest block mb-1">
                MODULE 01
              </span>
              <h2 className="text-xl font-black text-white mb-2">ผู้ตั้งรหัสลับ (Operator)</h2>
              <p className="text-xs text-slate-300 mb-4">
                ตั้งคำศัพท์ภาษาอังกฤษและคีย์ เพื่อสร้างห้องเล่นกับเพื่อน
              </p>
              <button
                onClick={() => setRole("OPERATOR_SETUP")}
                className="tactile-btn w-full h-14 bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-lg rounded-xl"
              >
                + ตั้งค่า & สร้างห้องใหม่
              </button>
            </div>

            <div className="bg-slate-900 border-2 border-sky-500/60 rounded-2xl p-5">
              <span className="text-xs font-black text-sky-400 uppercase tracking-widest block mb-1">
                MODULE 02
              </span>
              <h2 className="text-xl font-black text-white mb-2">ผู้ปลดชนวน (Defuser)</h2>
              <p className="text-xs text-slate-300 mb-3">
                กรอกรหัส 4 หลักที่ได้จากคู่หูเพื่อเข้าสู่แผงควบคุม
              </p>
              <input
                type="text"
                maxLength={4}
                placeholder="รหัสห้อง 4 หลัก"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full h-14 bg-black text-sky-400 font-mono text-3xl font-black text-center rounded-xl border-2 border-slate-700 mb-3 tracking-widest uppercase focus:border-sky-400 outline-none"
              />
              <button
                onClick={handleJoinRoom}
                className="tactile-btn w-full h-14 bg-gradient-to-r from-sky-600 to-blue-600 text-white text-lg rounded-xl"
              >
                จอยเข้าห้องทันที
              </button>
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
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="vault-container p-6 sm:p-8 max-w-lg">
          <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-6">
            <h2 className="text-2xl font-black text-amber-400">⚙️ ตั้งค่าคำลับ</h2>
            <button
              onClick={() => setRole("MENU")}
              className="tactile-btn bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg border-slate-700"
            >
              ย้อนกลับ
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-1">
                1. คำศัพท์ลับที่ต้องการให้ทาย (3-4 ตัวอักษร):
              </label>
              <input
                type="text"
                maxLength={4}
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value.toUpperCase())}
                className="w-full h-14 bg-black border-2 border-slate-700 rounded-xl text-3xl font-mono text-center tracking-widest font-black text-emerald-400 outline-none focus:border-emerald-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-1">
                2. กุญแจ Key (ต้องยาวเท่ากับคำศัพท์):
              </label>
              <input
                type="text"
                maxLength={4}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                className="w-full h-14 bg-black border-2 border-slate-700 rounded-xl text-3xl font-mono text-center tracking-widest font-black text-sky-400 outline-none focus:border-sky-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-1">
                3. เวลาที่ให้กู้ระเบิด:
              </label>
              <select
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-full h-14 bg-black border-2 border-slate-700 rounded-xl px-4 text-xl font-bold text-white outline-none"
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
            className="tactile-btn w-full h-16 bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-xl rounded-xl"
          >
            {isSubmitting ? "กำลังสร้างห้อง..." : "✓ บันทึกรหัส & สร้างห้อง"}
          </button>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 3. หน้าจอ OPERATOR LOBBY
  // =========================================================================
  if (role === "OPERATOR_LOBBY") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="vault-container p-6 sm:p-10 max-w-lg text-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
            นำรหัสห้องนี้ให้อีกฝั่งกรอก
          </span>
          <div className="text-6xl font-black font-mono tracking-widest text-amber-400 my-4 bg-black py-3 rounded-2xl border-2 border-amber-500/50">
            {roomId}
          </div>

          <div className={`p-4 rounded-xl text-base font-bold border mb-6 ${
            defuserJoined 
              ? "bg-emerald-950 border-emerald-500 text-emerald-300" 
              : "bg-amber-950 border-amber-500 text-amber-300 animate-pulse"
          }`}>
            {defuserJoined ? "✓ คู่หูเชื่อมต่อเข้าสู่ตู้เซฟแล้ว!" : "⏳ รอให้อีกฝั่งใส่รหัสห้องเข้ามา..."}
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-left space-y-2 mb-6 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">คำศัพท์ลับ:</span>
              <span className="text-emerald-400 font-bold font-mono text-xl">{targetWord}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Secret Key:</span>
              <span className="text-sky-400 font-bold font-mono text-xl">{secretKey}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cipher (HEX):</span>
              <span className="text-amber-400 font-bold font-mono text-xl">{cipherHex}</span>
            </div>
          </div>

          {gameStatus === "LOBBY" && (
            <button
              onClick={handleArmBomb}
              disabled={!defuserJoined}
              className={`tactile-btn w-full h-16 rounded-xl text-xl uppercase ${
                defuserJoined
                  ? "bg-gradient-to-r from-red-600 to-rose-600 text-white cursor-pointer"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed border-slate-700"
              }`}
            >
              {defuserJoined ? "🚀 เริ่มนับเวลาถอยหลังทันที" : "รอผู้กู้ระเบิดเข้าห้องก่อน"}
            </button>
          )}

          {gameStatus === "PLAYING" && (
            <div className="vault-timer py-4 text-6xl font-black">
              {formatTimer(timeLeft)}
            </div>
          )}

          {gameStatus === "DEFUSED" && (
            <div className="p-4 bg-emerald-600 text-white font-black rounded-xl text-xl mt-4">
              ✓ อีกฝั่งกู้ระเบิดสำเร็จ!
            </div>
          )}

          {gameStatus === "EXPLODED" && (
            <div className="p-4 bg-red-600 text-white font-black rounded-xl text-xl mt-4 animate-bounce">
              💥 ระเบิดทำงาน! อีกฝ่ายตอบผิดหรือหมดเวลา
            </div>
          )}
        </div>
      </main>
    );
  }

  // =========================================================================
  // 4. หน้าจอ DEFUSER : แผงตู้เซฟปลดชนวนสมบูรณ์แบบ
  // =========================================================================
  const currentCipherBits = cipherBitsMatrix[activeCharIndex] || [0,0,0,0,0,0,0,0];
  const currentKeyBits = keyBitsMatrix[activeCharIndex] || [0,0,0,0,0,0,0,0];
  const currentUserBits = userBitsMatrix[activeCharIndex] || [0,0,0,0,0,0,0,0];

  return (
    <main className="min-h-screen flex items-center justify-center p-3 sm:p-6">
      <div className="vault-container p-4 sm:p-7">
        <div className="brass-screw absolute top-3 left-3" />
        <div className="brass-screw absolute top-3 right-3" />
        <div className="brass-screw absolute bottom-3 left-3" />
        <div className="brass-screw absolute bottom-3 right-3" />

        {/* แถบหัวสถานะ */}
        <div className="flex justify-between items-center bg-black/70 border border-slate-700 rounded-xl px-4 py-2.5 mb-4">
          <div className="text-sm font-bold text-slate-300">
            ROOM: <span className="text-amber-400 font-mono text-xl ml-1 font-black">{roomId}</span>
          </div>
          <button
            onClick={() => { setRoomId(""); setRole("MENU"); }}
            className="tactile-btn bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-lg border-slate-700"
          >
            เมนูหลัก
          </button>
        </div>

        {gameStatus === "LOBBY" ? (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-10 text-center my-6">
            <div className="w-14 h-14 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-black text-white mb-2">เชื่อมต่อระบบแล้ว</h2>
            <p className="text-slate-400 text-sm">กำลังรอให้ฝ่ายตั้งรหัสกดเริ่มปล่อยสัญญาณ...</p>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* โมดูลบน: นาฬิกา 7-Segment + สัญญาณ Cipher + Key */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-3 text-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                  COUNTDOWN
                </span>
                <div className="vault-timer py-2 text-4xl sm:text-5xl font-black">
                  {formatTimer(timeLeft)}
                </div>
              </div>

              <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-3 text-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                  CIPHER (HEX)
                </span>
                <div className="text-2xl sm:text-3xl font-mono font-black text-amber-400 mt-2">
                  {cipherHex || "--"}
                </div>
              </div>

              <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-3 text-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                  SECRET KEY
                </span>
                <div className="text-2xl sm:text-3xl font-mono font-black text-sky-400 mt-2">
                  {defuserKey || "----"}
                </div>
              </div>
            </div>

            {/* แผงถอดรหัสบิต XOR: 8 บิตตรงแนวกันแบบ Column-by-Column */}
            <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-4 sm:p-6">
              
              {/* แถบเลือกตัวอักษร */}
              <div className="flex flex-wrap justify-between items-center border-b border-slate-700 pb-3 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-300">เลือกตัวอักษร:</span>
                  <div className="flex gap-1.5">
                    {userBitsMatrix.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveCharIndex(idx)}
                        className={`tactile-btn px-3 py-1.5 text-xs font-mono rounded-lg ${
                          activeCharIndex === idx
                            ? "bg-amber-500 text-black border-amber-300"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        ตัวที่ {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-sm font-bold">
                  คำที่ถอดรหัสได้: <span className="text-2xl font-mono text-emerald-400 font-black ml-1">{currentDecodedWord}</span>
                </div>
              </div>

              {/* Grid 8 บิตล็อคคอลัมน์ตรงกันทุกแถว */}
              <div className="space-y-3 bg-black/60 p-3 sm:p-5 rounded-xl border border-slate-800">
                
                {/* 1. แถว Cipher Bits */}
                <div>
                  <div className="text-xs font-bold text-amber-400 mb-1 flex justify-between">
                    <span>INPUT A (Cipher บิต ตัวที่ {activeCharIndex + 1}):</span>
                    <span className="text-slate-500 text-[10px]">8 BITS</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
                    {currentCipherBits.map((bit, i) => (
                      <div
                        key={i}
                        className="h-10 sm:h-12 bg-slate-900 border border-amber-500/40 rounded-lg flex items-center justify-center font-mono text-lg sm:text-xl font-black text-amber-400"
                      >
                        {bit}
                      </div>
                    ))}
                  </div>
                </div>

                {/* สัญลักษณ์ XOR */}
                <div className="text-center py-0.5">
                  <span className="bg-purple-900/80 border border-purple-500/50 text-purple-200 font-mono text-xs font-bold px-3 py-0.5 rounded-full">
                    ↓ XOR (เหมือนกันได้ 0, ต่างกันได้ 1) ↓
                  </span>
                </div>

                {/* 2. แถว Key Bits */}
                <div>
                  <div className="text-xs font-bold text-sky-400 mb-1 flex justify-between">
                    <span>INPUT B (Key &apos;{defuserKey[activeCharIndex] || "?"}&apos; บิต):</span>
                    <span className="text-slate-500 text-[10px]">8 BITS</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
                    {currentKeyBits.map((bit, i) => (
                      <div
                        key={i}
                        className="h-10 sm:h-12 bg-slate-900 border border-sky-500/40 rounded-lg flex items-center justify-center font-mono text-lg sm:text-xl font-black text-sky-400"
                      >
                        {bit}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ลูกศรชี้ลง Output */}
                <div className="text-center py-0.5">
                  <span className="text-xs font-bold text-amber-400 animate-pulse">
                    ↓ แตะปุ่มสวิตช์ด้านล่างเพื่อเปลี่ยนค่า (0 ⇄ 1) ให้ตรงกับผล XOR ↓
                  </span>
                </div>

                {/* 3. แถวปุ่มแตะสลับบิต (Output) */}
                <div>
                  <div className="text-xs font-bold text-emerald-400 mb-1 flex justify-between">
                    <span>OUTPUT (ผลลัพธ์ถอดรหัส):</span>
                    <span className="text-slate-400 text-[10px]">แตะเพื่อสลับบิต</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
                    {currentUserBits.map((bit, bitIdx) => (
                      <button
                        key={bitIdx}
                        onClick={() => toggleBit(bitIdx)}
                        className={`bit-toggle-btn ${bit === 1 ? "bit-toggle-1" : "bit-toggle-0"}`}
                      >
                        <span className="text-2xl sm:text-3xl font-black">{bit}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

            </div>

            {/* ปุ่มตัดวงจรปลดชนวน */}
            <button
              onClick={handleExecuteDefuse}
              disabled={gameStatus !== "PLAYING"}
              className={`tactile-btn w-full h-16 sm:h-18 rounded-2xl text-xl font-black uppercase tracking-wider ${
                gameStatus === "PLAYING"
                  ? "bg-gradient-to-r from-red-600 via-orange-600 to-amber-500 text-white cursor-pointer"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed border-slate-700"
              }`}
            >
              ✂️ CUT CIRCUIT / UNLOCK VAULT (ปลดชนวนระเบิด)
            </button>

            {/* แจ้งผลชนะ/แพ้ */}
            {gameStatus === "DEFUSED" && (
              <div className="p-4 bg-emerald-600 text-white font-black text-center text-xl rounded-xl shadow-lg">
                ✓ BOMB DEFUSED! ปลดชนวนตู้เซฟสำเร็จ!
              </div>
            )}
            {gameStatus === "EXPLODED" && (
              <div className="p-4 bg-red-600 text-white font-black text-center text-xl rounded-xl shadow-lg animate-bounce">
                💥 BOOM! ระเบิดทำงาน ถอดรหัสผิดพลาดหรือหมดเวลา!
              </div>
            )}

          </div>
        )}

        <div className="text-center text-xs text-slate-400 py-2 mt-2">
          RULE: 0 ⊕ 0 = 0 | 0 ⊕ 1 = 1 | 1 ⊕ 0 = 1 | 1 ⊕ 1 = 0
        </div>
      </div>
    </main>
  );
}