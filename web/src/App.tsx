import { useRouteStore } from "./store";
import { UploadView } from "./components/UploadView";
import { ReviewView } from "./components/ReviewView";

export default function App() {
  const view = useRouteStore((s) => s.view);
  return view === "upload" ? <UploadView /> : <ReviewView />;
}
