import { NavLink, Route, Routes } from "react-router-dom";
import BrowsePage from "./features/browse/BrowsePage";
import PlayerPage from "./features/player/PlayerPage";
import ProgressPage from "./features/progress/ProgressPage";
import AboutPage from "./features/about/AboutPage";
import NotFound from "./components/NotFound";
import styles from "./App.module.css";

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

export default function App() {
  return (
    <div className={styles.shell}>
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
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/watch/:videoId" element={<PlayerPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className={styles.footer}>
        <NavLink to="/about">Giới thiệu & quyền riêng tư · About & privacy</NavLink>
      </footer>
    </div>
  );
}
