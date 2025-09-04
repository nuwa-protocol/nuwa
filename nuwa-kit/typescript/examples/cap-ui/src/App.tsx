import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Home from "./pages/Home";
import NotePage from "./pages/NotePage";
import NuwaClientDemoPage from "./pages/NuwaClientDemoPage";
import WeatherPage from "./pages/WeatherPage";

function App() {
  return (
    <Router>
      <div className="font-sans antialiased">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="/demo" element={<NuwaClientDemoPage />} />
          <Route path="/note" element={<NotePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
