import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Review from "./pages/Review";

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/review/:wordbookId" element={<Review />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
