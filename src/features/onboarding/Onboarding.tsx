import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Onboarding.module.css";

export const ONBOARDING_KEY = "pf:onboarding:v1";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, "dismissed");
  } catch {
    // private mode: it will show again next visit, which is fine
  }
}

const STEPS = [
  {
    icon: "🎯",
    vi: "Chọn âm cần luyện",
    en: "Pick a sound",
    textVi: "Lọc video theo âm bạn hay mắc lỗi: âm cuối, th, đuôi -ed…",
    textEn: "Filter lessons by the sounds you struggle with.",
  },
  {
    icon: "🔁",
    vi: "Lặp lại một đoạn",
    en: "Loop a clip",
    textVi: "Đặt điểm A–B, giảm tốc độ và nghe lại nhiều lần.",
    textEn: "Set A–B, slow it down and listen again and again.",
  },
  {
    icon: "🎙️",
    vi: "Thu âm và so sánh",
    en: "Record and compare",
    textVi: "Nói theo, thu giọng mình rồi nghe so sánh với video.",
    textEn: "Shadow the speaker, record yourself, then compare.",
  },
];

export default function Onboarding() {
  const [open, setOpen] = useState(() => !wasDismissed());
  if (!open) return null;

  const dismiss = () => {
    remember();
    setOpen(false);
  };

  return (
    <section className={styles.panel} aria-labelledby="onboarding-title">
      <div className={styles.head}>
        <h2 id="onboarding-title">
          Bắt đầu thế nào? <span className={styles.en}>How it works</span>
        </h2>
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Đóng hướng dẫn · Close the introduction">
          ✕
        </button>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((s, i) => (
          <li key={s.en} className={styles.card}>
            <span className={styles.icon} aria-hidden="true">
              {s.icon}
            </span>
            <h3>
              {i + 1}. {s.vi} <span className={styles.en}>{s.en}</span>
            </h3>
            <p>
              {s.textVi} <span className={styles.en}>{s.textEn}</span>
            </p>
          </li>
        ))}
      </ol>
      <div className={styles.actions}>
        <Link to="/?tags=final-consonants" className={styles.primary} onClick={dismiss}>
          Bắt đầu với âm cuối · Start with ending sounds
        </Link>
        <button type="button" className={styles.secondary} onClick={dismiss}>
          Bỏ qua · Skip
        </button>
      </div>
    </section>
  );
}
