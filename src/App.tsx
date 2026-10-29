import { Suspense, lazy } from "react";
import { HashRouter, Route, Routes, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";

const Import = lazy(() => import("./pages/Import"));
const Review = lazy(() => import("./pages/Review"));

function ReviewRoute() {
  const { wordbookId } = useParams();
  return <Review key={wordbookId} />;
}
export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<div className="page route-loading" role="status">正在打开学习空间…</div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/import" element={<Import />} />
            <Route path="/review/:wordbookId" element={<ReviewRoute />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}
