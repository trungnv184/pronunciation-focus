import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import BrowsePage from "./features/browse/BrowsePage";
import NotFound from "./components/NotFound";
import styles from "./App.module.css";

// The home page loads eagerly; everything else is split out of the first bundle.
const PlayerPage = lazy(() => import("./features/player/PlayerPage"));
const ProgressPage = lazy(() => import("./features/progress/ProgressPage"));
const AboutPage = lazy(() => import("./features/about/AboutPage"));

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

export default function App() {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip} onClick={(e) => {
        e.preventDefault();
        document.getElementById("main")?.focus();
      }}>
        Bỏ qua đến nội dung · Skip to content
      </a>
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand} end>
          Luyện phát âm · Pronunciation Focus
        </NavLink>
        <nav aria-label="Chính · Main">
          <ul className={styles.nav}>
            <li>
              <NavLink to="/" end className={navClass}>
                Videos
              </NavLink>
            </li>
            <li>
              <NavLink to="/progress" className={navClass}>
                Tiến độ / Progress
              </NavLink>
            </li>
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        <Suspense fallback={<p role="status">Đang tải… · Loading…</p>}>
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/watch/:videoId" element={<PlayerPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <footer className={styles.footer}>
        <NavLink to="/about">Giới thiệu & quyền riêng tư · About & privacy</NavLink>
        <p>Video thuộc về tác giả trên YouTube · Videos belong to their creators on YouTube</p>
      </footer>
    </div>
  );
}
