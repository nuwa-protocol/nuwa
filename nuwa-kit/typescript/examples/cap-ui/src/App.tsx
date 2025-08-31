import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import WeatherPage from './pages/WeatherPage';
import TestPage from './pages/TestPage';
import NotePage from './pages/NotePage';

function App() {
  return (
    <Router>
      <div className="font-sans antialiased">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/note" element={<NotePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;