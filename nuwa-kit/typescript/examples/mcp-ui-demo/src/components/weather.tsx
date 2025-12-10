import cx from 'classnames';
import { format, isWithinInterval } from 'date-fns';
import { useEffect, useState } from 'react';

export interface WeatherAtLocation {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units: {
    time: string;
    interval: string;
    temperature_2m: string;
  };
  current: {
    time: string;
    interval: number;
    temperature_2m: number;
  };
  hourly_units: {
    time: string;
    temperature_2m: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
  };
  daily_units: {
    time: string;
    sunrise: string;
    sunset: string;
  };
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
  };
}

export const SAMPLE = {
  latitude: 37.763283,
  longitude: -122.41286,
  generationtime_ms: 0.027894973754882812,
  utc_offset_seconds: 0,
  timezone: 'GMT',
  timezone_abbreviation: 'GMT',
  elevation: 18,
  current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C' },
  current: { time: '2024-10-07T19:30', interval: 900, temperature_2m: 29.3 },
  hourly_units: { time: 'iso8601', temperature_2m: '°C' },
  hourly: {
    time: [
      '2024-10-07T00:00',
      '2024-10-07T01:00',
      '2024-10-07T02:00',
      '2024-10-07T03:00',
      '2024-10-07T04:00',
      '2024-10-07T05:00',
      '2024-10-07T06:00',
      '2024-10-07T07:00',
      '2024-10-07T08:00',
      '2024-10-07T09:00',
      '2024-10-07T10:00',
      '2024-10-07T11:00',
      '2024-10-07T12:00',
      '2024-10-07T13:00',
      '2024-10-07T14:00',
      '2024-10-07T15:00',
      '2024-10-07T16:00',
      '2024-10-07T17:00',
      '2024-10-07T18:00',
      '2024-10-07T19:00',
      '2024-10-07T20:00',
      '2024-10-07T21:00',
      '2024-10-07T22:00',
      '2024-10-07T23:00',
      '2024-10-08T00:00',
      '2024-10-08T01:00',
      '2024-10-08T02:00',
      '2024-10-08T03:00',
      '2024-10-08T04:00',
      '2024-10-08T05:00',
      '2024-10-08T06:00',
      '2024-10-08T07:00',
      '2024-10-08T08:00',
      '2024-10-08T09:00',
      '2024-10-08T10:00',
      '2024-10-08T11:00',
      '2024-10-08T12:00',
      '2024-10-08T13:00',
      '2024-10-08T14:00',
      '2024-10-08T15:00',
      '2024-10-08T16:00',
      '2024-10-08T17:00',
      '2024-10-08T18:00',
      '2024-10-08T19:00',
      '2024-10-08T20:00',
      '2024-10-08T21:00',
      '2024-10-08T22:00',
      '2024-10-08T23:00',
      '2024-10-09T00:00',
      '2024-10-09T01:00',
      '2024-10-09T02:00',
      '2024-10-09T03:00',
      '2024-10-09T04:00',
      '2024-10-09T05:00',
      '2024-10-09T06:00',
      '2024-10-09T07:00',
      '2024-10-09T08:00',
      '2024-10-09T09:00',
      '2024-10-09T10:00',
      '2024-10-09T11:00',
      '2024-10-09T12:00',
      '2024-10-09T13:00',
      '2024-10-09T14:00',
      '2024-10-09T15:00',
      '2024-10-09T16:00',
      '2024-10-09T17:00',
      '2024-10-09T18:00',
      '2024-10-09T19:00',
      '2024-10-09T20:00',
      '2024-10-09T21:00',
      '2024-10-09T22:00',
      '2024-10-09T23:00',
      '2024-10-10T00:00',
      '2024-10-10T01:00',
      '2024-10-10T02:00',
      '2024-10-10T03:00',
      '2024-10-10T04:00',
      '2024-10-10T05:00',
      '2024-10-10T06:00',
      '2024-10-10T07:00',
      '2024-10-10T08:00',
      '2024-10-10T09:00',
      '2024-10-10T10:00',
      '2024-10-10T11:00',
      '2024-10-10T12:00',
      '2024-10-10T13:00',
      '2024-10-10T14:00',
      '2024-10-10T15:00',
      '2024-10-10T16:00',
      '2024-10-10T17:00',
      '2024-10-10T18:00',
      '2024-10-10T19:00',
      '2024-10-10T20:00',
      '2024-10-10T21:00',
      '2024-10-10T22:00',
      '2024-10-10T23:00',
      '2024-10-11T00:00',
      '2024-10-11T01:00',
      '2024-10-11T02:00',
      '2024-10-11T03:00',
    ],
    temperature_2m: [
      36.6, 32.8, 29.5, 28.6, 29.2, 28.2, 27.5, 26.6, 26.5, 26, 25, 23.5, 23.9, 24.2, 22.9, 21, 24,
      28.1, 31.4, 33.9, 32.1, 28.9, 26.9, 25.2, 23, 21.1, 19.6, 18.6, 17.7, 16.8, 16.2, 15.5, 14.9,
      14.4, 14.2, 13.7, 13.3, 12.9, 12.5, 13.5, 15.8, 17.7, 19.6, 21, 21.9, 22.3, 22, 20.7, 18.9,
      17.9, 17.3, 17, 16.7, 16.2, 15.6, 15.2, 15, 15, 15.1, 14.8, 14.8, 14.9, 14.7, 14.8, 15.3,
      16.2, 17.9, 19.6, 20.5, 21.6, 21, 20.7, 19.3, 18.7, 18.4, 17.9, 17.3, 17, 17, 16.8, 16.4,
      16.2, 16, 15.8, 15.7, 15.4, 15.4, 16.1, 16.7, 17, 18.6, 19, 19.5, 19.4, 18.5, 17.9, 17.5,
      16.7, 16.3, 16.1,
    ],
  },
  daily_units: {
    time: 'iso8601',
    sunrise: 'iso8601',
    sunset: 'iso8601',
  },
  daily: {
    time: ['2024-10-07', '2024-10-08', '2024-10-09', '2024-10-10', '2024-10-11'],
    sunrise: [
      '2024-10-07T07:15',
      '2024-10-08T07:16',
      '2024-10-09T07:17',
      '2024-10-10T07:18',
      '2024-10-11T07:19',
    ],
    sunset: [
      '2024-10-07T19:00',
      '2024-10-08T18:58',
      '2024-10-09T18:57',
      '2024-10-10T18:55',
      '2024-10-11T18:54',
    ],
  },
};

function n(num: number): number {
  return Math.ceil(num);
}

export function Weather({ weatherAtLocation = SAMPLE }: { weatherAtLocation?: WeatherAtLocation }) {
  const currentHigh = Math.max(...weatherAtLocation.hourly.temperature_2m.slice(0, 24));
  const currentLow = Math.min(...weatherAtLocation.hourly.temperature_2m.slice(0, 24));

  const isDay = isWithinInterval(new Date(weatherAtLocation.current.time), {
    start: new Date(weatherAtLocation.daily.sunrise[0]),
    end: new Date(weatherAtLocation.daily.sunset[0]),
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const hoursToShow = isMobile ? 5 : 6;

  // Find the index of the current time or the next closest time
  const currentTimeIndex = weatherAtLocation.hourly.time.findIndex(
    time => new Date(time) >= new Date(weatherAtLocation.current.time)
  );

  // Slice the arrays to get the desired number of items
  const displayTimes = weatherAtLocation.hourly.time.slice(
    currentTimeIndex,
    currentTimeIndex + hoursToShow
  );
  const displayTemperatures = weatherAtLocation.hourly.temperature_2m.slice(
    currentTimeIndex,
    currentTimeIndex + hoursToShow
  );

  return (
    <div
      className={cx(
        'relative flex flex-col gap-6 rounded-3xl p-6 max-w-[500px] shadow-sm backdrop-blur-sm transition-all duration-300 ease-in-out transform hover:scale-105 animate-in fade-in slide-in-from-bottom-4 duration-500',
        {
          'bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600': isDay,
        },
        {
          'bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900': !isDay,
        }
      )}
    >
      <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-3xl" />

      <div className="relative z-10 flex flex-row justify-between items-start">
        <div className="flex flex-row gap-4 items-center">
          <div
            className={cx(
              'relative size-16 rounded-full transition-all duration-200 hover:scale-110 animate-pulse',
              {
                'bg-gradient-to-br from-yellow-300 to-orange-400 shadow-sm shadow-yellow-400/30':
                  isDay,
              },
              {
                'bg-gradient-to-br from-slate-200 to-blue-100 shadow-sm shadow-blue-200/20': !isDay,
              }
            )}
          >
            <div
              className={cx(
                'absolute inset-2 rounded-full transition-all duration-300',
                {
                  'bg-gradient-to-br from-yellow-200 to-yellow-300 animate-spin': isDay,
                },
                {
                  'bg-gradient-to-br from-blue-50 to-indigo-100': !isDay,
                }
              )}
            />
          </div>
          <div className="flex flex-col">
            <div className="text-5xl font-bold text-white drop-shadow-lg animate-in slide-in-from-left-2 duration-400">
              {n(weatherAtLocation.current.temperature_2m)}
              <span className="text-2xl opacity-80">
                {weatherAtLocation.current_units.temperature_2m}
              </span>
            </div>
            <div className="text-white/80 text-sm mt-1 animate-in slide-in-from-left-2 duration-400 delay-100">
              {format(new Date(weatherAtLocation.current.time), 'EEEE, MMM d')}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 animate-in slide-in-from-right-2 duration-400 delay-150">
          <div className="text-white/90 font-medium">H: {n(currentHigh)}°</div>
          <div className="text-white/70">L: {n(currentLow)}°</div>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-5 md:grid-cols-6 gap-2">
        {displayTimes.map((time, index) => (
          <div
            key={time}
            className="flex flex-col items-center gap-2 p-2 rounded-xl bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all duration-200 hover:scale-105 animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="text-white/80 text-xs font-medium">{format(new Date(time), 'ha')}</div>
            <div
              className={cx(
                'size-8 rounded-full transition-all duration-200 hover:scale-110',
                {
                  'bg-gradient-to-br from-yellow-300 to-orange-400 shadow-sm shadow-yellow-400/20':
                    isDay,
                },
                {
                  'bg-gradient-to-br from-slate-300 to-blue-200 shadow-sm shadow-blue-200/15':
                    !isDay,
                }
              )}
            />
            <div className="text-white font-semibold text-sm">{n(displayTemperatures[index])}°</div>
          </div>
        ))}
      </div>

      <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-3xl blur-xl" />
    </div>
  );
}
