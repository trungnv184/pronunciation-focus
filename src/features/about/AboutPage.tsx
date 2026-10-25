import { useVideoIndex } from "../../data/loadIndex";
import styles from "./AboutPage.module.css";

const REPO_URL = "https://github.com/trungnv184/pronunciation-focus";

export default function AboutPage() {
  const state = useVideoIndex();
  const channels = state.status === "ready" ? state.index.channels : [];

  return (
    <article className={styles.page}>
      <h1>Giới thiệu · About</h1>
      <p className={styles.lead}>
        Luyện phát âm là trang học miễn phí giúp người Việt luyện phát âm tiếng Anh: chọn âm cần luyện, lặp lại
        từng đoạn video, thu âm giọng mình và so sánh.
        <span className={styles.en}>
          Pronunciation Focus is a free site that helps Vietnamese speakers practise English pronunciation: pick a
          sound, loop a clip, record yourself and compare.
        </span>
      </p>

      <section aria-labelledby="about-videos">
        <h2 id="about-videos">Video được chọn thế nào · How videos are chosen</h2>
        <p>
          Chúng tôi chọn một danh sách kênh dạy phát âm. Mỗi tuần, một chương trình tự động lấy video mới từ các kênh
          này, giữ lại các bài học về phát âm và gắn nhãn theo âm dựa trên tiêu đề và mô tả.
          <span className={styles.en}>
            We pick a short list of pronunciation channels. Every week an automated job fetches their new uploads,
            keeps the pronunciation lessons and tags them by sound using their titles and descriptions. Tags are
            rule-based, so a few may be wrong.
          </span>
        </p>
        <h3>Cảm ơn các kênh · Thanks to these channels</h3>
        {channels.length > 0 ? (
          <ul className={styles.channels}>
            {channels.map((c) => (
              <li key={c.handle}>
                <a href={`https://www.youtube.com/${c.handle}`} target="_blank" rel="noopener noreferrer">
                  {c.title}
                </a>{" "}
                <span className={styles.muted}>
                  ({c.handle} · {c.lang === "vi" ? "Tiếng Việt" : "English"})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{state.status === "error" ? "Không tải được danh sách kênh · Could not load the channel list." : "Đang tải… · Loading…"}</p>
        )}
        <p>
          Video được phát qua YouTube và thuộc về tác giả của chúng. Hãy đăng ký kênh nếu bạn thấy hữu ích.
          <span className={styles.en}>
            Videos play through YouTube and belong to their creators. Please subscribe to the channels you find
            useful.
          </span>
        </p>
      </section>

      <section aria-labelledby="about-youtube">
        <h2 id="about-youtube">YouTube API Services</h2>
        <p>
          Trang này sử dụng YouTube API Services. Khi dùng trang, bạn đồng ý với{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
            Điều khoản dịch vụ của YouTube · YouTube Terms of Service
          </a>
          . Xem thêm{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Chính sách quyền riêng tư của Google · Google Privacy Policy
          </a>
          .
          <span className={styles.en}>
            This site uses YouTube API Services. By using it you agree to be bound by the YouTube Terms of Service;
            see also the Google Privacy Policy.
          </span>
        </p>
      </section>

      <section aria-labelledby="about-privacy">
        <h2 id="about-privacy">Quyền riêng tư · Privacy policy</h2>
        <ul className={styles.list}>
          <li>
            Không có tài khoản, không có công cụ phân tích hay quảng cáo.
            <span className={styles.en}>No accounts, no analytics, no ads.</span>
          </li>
          <li>
            Bản thu âm của bạn chỉ lưu trên thiết bị này (IndexedDB) và không bao giờ được tải lên. Bạn có thể xóa
            chúng bất cứ lúc nào.
            <span className={styles.en}>
              Your recordings are stored only on this device (IndexedDB) and are never uploaded. You can delete them
              at any time.
            </span>
          </li>
          <li>
            Tiến độ học lưu trong trình duyệt (localStorage). Bạn có thể xuất, nhập hoặc xóa ở trang Tiến độ.
            <span className={styles.en}>
              Your progress is stored in this browser (localStorage). You can export, import or reset it on the
              Progress page.
            </span>
          </li>
          <li>
            Trình phát YouTube nhúng có thể đặt cookie và gửi dữ liệu cho Google theo chính sách của Google.
            <span className={styles.en}>
              The embedded YouTube player may set cookies and send data to Google under Google's policies.
            </span>
          </li>
          <li>
            Micro chỉ được dùng khi bạn bấm “Thu âm” và được tắt ngay khi dừng thu.
            <span className={styles.en}>The microphone is used only when you press Record and is turned off when recording stops.</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="about-contact">
        <h2 id="about-contact">Liên hệ · Contact</h2>
        <p>
          Góp ý, báo nhãn sai hoặc đề xuất kênh mới:{" "}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
            GitHub Issues
          </a>
          .
          <span className={styles.en}>Feedback, wrong tags or channel suggestions: open a GitHub issue.</span>
        </p>
      </section>
    </article>
  );
}
