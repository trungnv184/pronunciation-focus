import { useParams } from "react-router-dom";

export default function PlayerPage() {
  const { videoId } = useParams();
  return <h1>Xem video · Watch {videoId}</h1>;
}
