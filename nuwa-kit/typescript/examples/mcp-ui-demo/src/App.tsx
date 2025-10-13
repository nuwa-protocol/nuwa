import { NuwaProvider } from "@nuwa-ai/ui-kit";
import React, { useEffect, useState } from "react";
import { Weather, type WeatherAtLocation } from "@/components/weather";

function WeatherContent() {
  const [weatherData, setWeatherData] = useState<WeatherAtLocation | null>(
    null,
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const latitude = searchParams.get("latitude") ?? "22.3356";
    const longitude = searchParams.get("longitude") ?? "114.1847";
    const getWeather = async () => {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
      );

      const weatherData = (await response.json()) as WeatherAtLocation;
      setWeatherData(weatherData);
    };

    getWeather();
  }, []);

  return (
    <div className="p-4">
      {weatherData ? (
        <Weather weatherAtLocation={weatherData} />
      ) : (
        <div>Loading weather...</div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <NuwaProvider>
      <React.Suspense fallback={<div>Loading weather...</div>}>
        <WeatherContent />
      </React.Suspense>
    </NuwaProvider>
  );
}
