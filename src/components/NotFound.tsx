import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <section>
      <h1>Không tìm thấy trang · Page not found</h1>
      <p>
        <Link to="/">Về trang chủ · Back to videos</Link>
      </p>
    </section>
  );
}
