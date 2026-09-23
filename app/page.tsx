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

export default function BombDefusalGame() {
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
  
  // สถานะบิตที่น้องกดเลือก
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [userBits, setUserBits] = useState<number[][]>([[0,0,0,0,0,0,0,0]]);

  const pollInterval = useRef<any>(null);

  // ถอดรหัสบิตเป็นตัวอักษร
  const currentDecodedWord = userBits
    .map((byte) => {
      const code = parseInt(byte.join(""), 2);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : "?";
    })
    .join("");

  // 1. ผู้ตั้งรหัสกดสร้างห้อง (แก้บั๊ก CAT/BAT และช่องว่าง)
  const handleSaveAndCreateRoom = async () => {
    const t = (targetWord || "CAT").trim().toUpperCase();
    const k = (secretKey || "BAT").trim().toUpperCase();

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
        alert("ไม่พบรหัสห้องนี้ (ตรวจสอบว่าฝั่งตั้งรหัสกดสร้างห้องหรือยัง)");
      }
    } catch {
      alert("เชื่อมต่อเซิร์ฟเวอร์ขัดข้อง");
    }
  };

  // Polling ข้อมูล Realtime จากเซิร์ฟเวอร์
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

  // ผู้ตั้งรหัสกดเริ่มเกม
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

  // แตะสลับบิต
  const toggleBit = (bitIndex: number) => {
    if (gameStatus !== "PLAYING") return;
    setUserBits((prev) => {
      const next = prev.map((arr) => [...arr]);
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
  // 1. หน้าจอ MENU: ปุ่มใหญ่ชัดเจน เหมาะกับมือถือ
  // =========================================================================
  if (role === "MENU") {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="w-full max-w-md bg-slate-900/95 border-4 border-slate-600 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur">
          <div className="text-center mb-6">
            <h1 className="text-3xl sm:text-4xl font-black text-amber-400 tracking-wider mb-2">
              BOMB DEFUSAL
            </h1>
            <div className="inline-block bg-sky-500/20 text-sky-300 font-mono text-xs px-3 py-1 rounded-full font-bold border border-sky-400/40">
              XOR CIPHER MODULE WORKSHOP
            </div>
          </div>

          <div className="space-y-6">
            {/* กล่องผู้ตั้งรหัส */}
            <div className="bg-slate-800/90 border-2 border-amber-500/50 rounded-2xl p-5 shadow">
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest block mb-1">
                ฝ่ายที่ 1 : ผู้สร้างโจทย์
              </span>
              <h2 className="text-xl font-bold text-white mb-2">ตั้งค่าคำและเปิดห้อง</h2>
              <p className="text-xs text-slate-300 mb-4">
                พิมพ์คำศัพท์ภาษาอังกฤษ กุญแจลับ แล้วกดสร้างห้องเพื่อรอเพื่อน
              </p>
              <button
                onClick={() => setRole("OPERATOR_SETUP")}
                className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-lg rounded-xl shadow-lg active:scale-95 transition"
              >
                + สร้างห้องใหม่
              </button>
            </div>

            {/* กล่องผู้กู้ระเบิด */}
            <div className="bg-slate-800/90 border-2 border-sky-500/50 rounded-2xl p-5 shadow">
              <span className="text-xs font-black text-sky-400 uppercase tracking-widest block mb-1">
                ฝ่ายที่ 2 : ผู้กู้ระเบิด
              </span>
              <h2 className="text-xl font-bold text-white mb-2">เข้าห้องกู้ระเบิด</h2>
              <p className="text-xs text-slate-300 mb-3">
                กรอกรหัส 4 หลักที่ได้จากเพื่อนเพื่อเข้าสู่โมดูลระเบิด
              </p>
              <input
                type="text"
                maxLength={4}
                placeholder="รหัสห้อง 4 หลัก"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full h-14 bg-slate-950 text-sky-300 font-mono text-3xl font-black text-center rounded-xl border-2 border-slate-600 mb-3 tracking-widest uppercase focus:border-sky-400 outline-none"
              />
              <button
                onClick={handleJoinRoom}
                className="w-full h-14 bg-sky-600 hover:bg-sky-500 text-white font-black text-lg rounded-xl shadow-lg active:scale-95 transition"
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
  // 2. หน้าจอตั้งค่ารหัสลับ (OPERATOR SETUP)
  // =========================================================================
  if (role === "OPERATOR_SETUP") {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="w-full max-w-lg bg-slate-900 border-4 border-slate-600 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-6">
            <h2 className="text-2xl font-black text-white">⚙️ ตั้งค่ารหัสลับ</h2>
            <button
              onClick={() => setRole("MENU")}
              className="text-xs text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-600"
            >
              ย้อนกลับ
            </button>
          </div>

          <div className="space-y-5 mb-8">
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                1. คำศัพท์ลับที่ต้องการให้ทาย (3-4 ตัวอักษร):
              </label>
              <input
                type="text"
                maxLength={4}
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value.toUpperCase())}
                className="w-full h-14 bg-slate-950 border-2 border-slate-600 rounded-xl text-3xl font-mono text-center tracking-widest font-black text-emerald-400 focus:border-emerald-500 outline-none uppercase"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                2. กุญแจ Key (ต้องยาวเท่าคำศัพท์):
              </label>
              <input
                type="text"
                maxLength={4}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                className="w-full h-14 bg-slate-950 border-2 border-slate-600 rounded-xl text-3xl font-mono text-center tracking-widest font-black text-sky-400 focus:border-sky-500 outline-none uppercase"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                3. เวลาที่ให้กู้ระเบิด:
              </label>
              <select
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-full h-14 bg-slate-950 border-2 border-slate-600 rounded-xl px-4 text-xl font-bold text-white outline-none"
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
            className="w-full h-16 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xl rounded-xl shadow-xl active:scale-95 transition"
          >
            {isSubmitting ? "กำลังสร้างห้อง..." : "✓ บันทึกรหัสลับ และ สร้างห้อง"}
          </button>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 3. หน้าจอ LOBBY ฝั่งผู้ตั้งรหัส
  // =========================================================================
  if (role === "OPERATOR_LOBBY") {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="w-full max-w-md bg-slate-900 border-4 border-slate-600 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
            นำรหัสห้องนี้ให้อีกฝั่งกรอก
          </span>
          <div className="text-6xl font-black font-mono tracking-widest text-amber-400 my-4 bg-slate-950 py-3 rounded-2xl border-2 border-amber-500/50">
            {roomId}
          </div>

          <div className={`p-4 rounded-xl mb-6 text-sm font-bold border ${
            defuserJoined 
              ? "bg-emerald-950/80 border-emerald-500 text-emerald-300" 
              : "bg-amber-950/80 border-amber-500 text-amber-300 animate-pulse"
          }`}>
            {defuserJoined ? "✓ คู่หูเชื่อมต่อเข้าห้องแล้ว!" : "⏳ รอให้อีกฝั่งใส่รหัสห้องเข้ามา..."}
          </div>

          {gameStatus === "LOBBY" && (
            <button
              onClick={handleArmBomb}
              disabled={!defuserJoined}
              className={`w-full h-16 rounded-xl font-black text-xl tracking-wider uppercase transition shadow-lg ${
                defuserJoined
                  ? "bg-red-600 hover:bg-red-500 text-white active:scale-95 cursor-pointer shadow-red-600/50"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"
              }`}
            >
              {defuserJoined ? "🚀 เริ่มนับเวลาถอยหลังทันที" : "รอผู้กู้ระเบิดเข้าห้องก่อน"}
            </button>
          )}

          {gameStatus === "PLAYING" && (
            <div className="bg-slate-950 border-2 border-red-500 rounded-2xl p-5">
              <span className="text-xs text-red-400 font-bold tracking-widest block mb-2">DETONATION TIMER</span>
              <span className="text-6xl font-mono text-red-500 font-black tracking-widest">
                {formatTimer(timeLeft)}
              </span>
            </div>
          )}

          {gameStatus === "DEFUSED" && (
            <div className="mt-4 p-4 bg-emerald-600 text-slate-950 font-black rounded-xl text-lg">
              ✓ อีกฝั่งกู้ระเบิดสำเร็จ!
            </div>
          )}

          {gameStatus === "EXPLODED" && (
            <div className="mt-4 p-4 bg-red-600 text-white font-black rounded-xl text-lg animate-bounce">
              💥 ระเบิดทำงาน! อีกฝ่ายตอบผิดหรือหมดเวลา
            </div>
          )}
        </div>
      </main>
    );
  }

  // =========================================================================
  // 4. หน้าจอ DEFUSER : เคสระเบิด KTaNE สีสดใส วางบนโต๊ะไม้ (ตามรูปต้นแบบ)
  // =========================================================================
  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-2 sm:p-6 select-none">
      {/* แถบหัวสถานะ */}
      <div className="w-full max-w-4xl flex justify-between items-center py-2 px-4 bg-slate-900/80 border border-slate-700 rounded-xl mb-4 backdrop-blur">
        <div className="text-sm font-bold text-slate-300">
          ROOM: <span className="text-amber-400 font-mono text-xl ml-1">{roomId}</span>
        </div>
        <button
          onClick={() => { setRoomId(""); setRole("MENU"); }}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-3 rounded-lg border border-slate-600"
        >
          กลับหน้าหลัก
        </button>
      </div>

      {gameStatus === "LOBBY" ? (
        <div className="ktane-casing p-8 max-w-md w-full text-center text-slate-800 my-auto">
          <div className="w-12 h-12 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-1">เชื่อมต่อเคสระเบิดแล้ว</h2>
          <p className="text-slate-600 text-sm">กำลังรอให้ผู้ตั้งรหัสกดยืนยันเริ่มปล่อยสัญญาณ...</p>
        </div>
      ) : (
        /* เคสระเบิด KTaNE สัดส่วน 2x3 Grid ตามภาพ[cite: 11] */
        <div className="w-full max-w-4xl my-auto">
          <div className="ktane-casing p-3 sm:p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

              {/* ช่อง 1: นาฬิกา 7-Segment ดิจิทัล LED สีแดง[cite: 11] */}
              <div className="ktane-module p-4 flex flex-col items-center justify-center min-h-[140px]">
                <div className="bolt absolute top-2 left-2" />
                <div className="bolt absolute top-2 right-2" />
                <span className="text-[11px] font-bold text-slate-700 tracking-wider mb-1">DETONATION TIMER</span>
                <div className="digital-timer text-5xl sm:text-6xl font-black px-6 py-2 tracking-widest my-auto">
                  {formatTimer(timeLeft)}
                </div>
                <div className="flex gap-2 items-center mt-1">
                  <span className="text-[10px] font-bold text-slate-500">STRIKE:</span>
                  <div className={`w-3 h-3 rounded-full ${gameStatus === "EXPLODED" ? "bg-red-600 animate-ping" : "bg-slate-400"}`} />
                  <div className={`w-3 h-3 rounded-full ${gameStatus === "DEFUSED" ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-slate-400"}`} />
                </div>
              </div>

              {/* ช่อง 2: โมดูลรับสัญญาณ Cipher และ Key[cite: 11] */}
              <div className="ktane-module p-4 flex flex-col justify-between min-h-[140px]">
                <div className="bolt absolute top-2 left-2" />
                <div className="bolt absolute top-2 right-2" />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-700 tracking-wider">RADIO RECEIVER</span>
                  <div className="w-8 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b] animate-pulse" />
                </div>
                <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-2 text-center my-auto">
                  <div className="text-[10px] text-slate-400">CIPHER (HEX): <span className="text-amber-400 font-mono text-lg font-bold ml-1">{cipherHex}</span></div>
                  <div className="text-[10px] text-slate-400 mt-1">GIVEN KEY: <span className="text-sky-400 font-mono text-lg font-bold ml-1">{defuserKey}</span></div>
                </div>
              </div>

              {/* ช่อง 3: โมดูลคู่มือกฎตรรกะ XOR[cite: 11] */}
              <div className="ktane-module p-4 flex flex-col justify-between min-h-[140px]">
                <div className="bolt absolute top-2 left-2" />
                <div className="bolt absolute top-2 right-2" />
                <span className="text-[11px] font-bold text-slate-700 tracking-wider">XOR TRUTH TABLE</span>
                <div className="bg-slate-900 text-slate-200 p-2 rounded-lg text-xs font-mono grid grid-cols-2 gap-1 my-auto">
                  <div>0 ⊕ 0 = <span className="text-sky-400 font-bold">0</span></div>
                  <div>0 ⊕ 1 = <span className="text-amber-400 font-bold">1</span></div>
                  <div>1 ⊕ 0 = <span className="text-amber-400 font-bold">1</span></div>
                  <div>1 ⊕ 1 = <span className="text-sky-400 font-bold">0</span></div>
                </div>
              </div>

              {/* ช่อง 4, 5, 6: แผง Interactive XOR Terminal สำหรับฝึกเทียบและแตะบิต[cite: 11] */}
              <div className="ktane-module md:col-span-3 p-4 sm:p-6 bg-slate-950 text-white border-4 border-slate-700">
                <div className="bolt absolute top-2 left-2" />
                <div className="bolt absolute top-2 right-2" />

                {/* แท็บเลือกตัวอักษร */}
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 mb-4 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">เลือกตัวอักษร:</span>
                    <div className="flex gap-1.5">
                      {userBits.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveCharIndex(idx)}
                          className={`w-10 h-8 rounded-lg text-xs font-mono font-black transition ${
                            activeCharIndex === idx
                              ? "bg-sky-500 text-slate-950 shadow-[0_0_12px_#38bdf8]"
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-sm font-bold">
                    คำที่ถอดรหัสได้: <span className="text-2xl font-mono text-emerald-400 font-black ml-1">{currentDecodedWord}</span>
                  </div>
                </div>

                {/* กระดานเทียบ Bit แบบ Graphic */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-xs font-bold text-slate-400 mb-1 sm:mb-0">INPUT A (Cipher Bit):</span>
                    <div className="text-xl font-mono tracking-[0.25em] text-amber-400 font-black">
                      {cipherBytes[activeCharIndex]?.join("") || "00000000"}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <span className="bg-purple-900/60 border border-purple-500/50 text-purple-300 font-mono text-xs font-bold px-3 py-0.5 rounded-full">
                      ↓ XOR กับ ↓
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-xs font-bold text-slate-400 mb-1 sm:mb-0">
                      INPUT B (Key &apos;{defuserKey[activeCharIndex] || "?"}&apos; Bit):
                    </span>
                    <div className="text-xl font-mono tracking-[0.25em] text-sky-400 font-black">
                      {keyBytes[activeCharIndex]?.join("") || "00000000"}
                    </div>
                  </div>

                  {/* แผงบิตที่น้องแตะเปลี่ยนได้ */}
                  <div className="text-center pt-2">
                    <span className="text-xs font-bold text-sky-300 block mb-2">
                      แตะที่ช่องบิตเพื่อสลับค่า (0 ⇄ 1)
                    </span>
                    <div className="flex justify-center gap-1.5 sm:gap-2.5 flex-wrap">
                      {userBits[activeCharIndex]?.map((bit, bitIdx) => (
                        <button
                          key={bitIdx}
                          onClick={() => toggleBit(bitIdx)}
                          className={`w-10 h-14 sm:w-12 sm:h-16 bit-box ${
                            bit === 1 ? "bit-box-1" : "bit-box-0"
                          } cursor-pointer active:scale-95`}
                        >
                          {bit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ปุ่มตัดวงจรปลดชนวน */}
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <button
                    onClick={handleExecuteDefuse}
                    disabled={gameStatus !== "PLAYING"}
                    className={`w-full h-16 rounded-xl font-black text-xl uppercase tracking-widest transition shadow-xl ${
                      gameStatus === "PLAYING"
                        ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white cursor-pointer active:scale-95 shadow-red-600/40"
                        : "bg-slate-800 text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    ⚡ CUT WIRE / DEFUSE (ปลดชนวนระเบิด)
                  </button>
                </div>

                {gameStatus === "DEFUSED" && (
                  <div className="mt-4 p-4 bg-emerald-500 text-slate-950 font-black text-center text-xl rounded-xl">
                    ✓ BOMB DEFUSED! ปลดชนวนระเบิดสำเร็จ!
                  </div>
                )}
                {gameStatus === "EXPLODED" && (
                  <div className="mt-4 p-4 bg-red-600 text-white font-black text-center text-xl rounded-xl animate-bounce">
                    💥 BOOM! ระเบิดทำงาน ถอดรหัสผิดพลาดหรือหมดเวลา!
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ฐานโต๊ะไม้ด้านล่างสไตล์ KTaNE[cite: 11] */}
      <div className="wooden-desk w-full h-10 rounded-t-2xl mt-4 border-t-2 border-amber-300/30" />
    </main>
  );
}