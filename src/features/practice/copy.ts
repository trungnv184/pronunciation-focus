import type { RecorderError } from "./useRecorder";
import type { Rating } from "./storage";

/** Bilingual copy for the shadowing panel: Vietnamese first, English second. */

export const ERROR_COPY: Record<RecorderError, { title: string; body: string }> = {
  permission: {
    title: "Micro đang bị chặn · Microphone access is blocked",
    body:
      "Để bật lại: nhấn biểu tượng ổ khóa (hoặc micro) bên trái thanh địa chỉ, chọn Cho phép micro, rồi tải lại trang. " +
      "Trên iPhone/iPad: Cài đặt → Safari → Micro → Cho phép. · " +
      "To re-enable it: click the lock (or microphone) icon next to the address bar, allow the microphone, then reload the page. " +
      "On iPhone/iPad: Settings → Safari → Microphone → Allow.",
  },
  "no-mic": {
    title: "Không tìm thấy micro · No microphone found",
    body:
      "Hãy cắm micro hoặc tai nghe có micro rồi thử lại. · " +
      "Plug in a microphone or a headset with a mic, then try again.",
  },
  unsupported: {
    title: "Trình duyệt không hỗ trợ ghi âm · This browser can't record audio",
    body:
      "Hãy dùng phiên bản mới của Chrome, Edge, Firefox hoặc Safari. Bạn vẫn có thể nghe đoạn A–B. · " +
      "Use a recent Chrome, Edge, Firefox or Safari. You can still listen to the A–B part.",
  },
  insecure: {
    title: "Cần kết nối bảo mật (https) · A secure (https) connection is needed",
    body:
      "Trình duyệt chỉ cho ghi âm trên trang https:// hoặc localhost. Hãy mở trang bằng địa chỉ https://. · " +
      "Browsers only allow recording on https:// pages or localhost. Open the site with an https:// address.",
  },
  failed: {
    title: "Không ghi âm được · Recording didn't work",
    body:
      "Micro có thể đang được ứng dụng khác dùng. Hãy đóng ứng dụng đó rồi thử lại. · " +
      "Another app may be using the microphone. Close it and try again.",
  },
};

export const RATINGS: ReadonlyArray<{ value: Rating; emoji: string; label: string }> = [
  { value: 1, emoji: "😕", label: "Chưa giống · Not there yet" },
  { value: 2, emoji: "🙂", label: "Khá giống · Getting close" },
  { value: 3, emoji: "😀", label: "Rất giống · Sounds right" },
];
