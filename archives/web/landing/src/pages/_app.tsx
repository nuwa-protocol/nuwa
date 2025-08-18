import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// 动态导入 BarLoader 组件，禁用 SSR
const BarLoader = dynamic(() => import('@/components/shared/BarLoader').then(mod => mod.default), {
  ssr: false
});

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleStart = () => {
      console.log('Loading started');
      setLoading(true);
    };

    const handleComplete = () => {
      console.log('Loading completed');
      setLoading(false);
    };

    const handleError = () => {
      console.log('Loading error');
      setLoading(false);
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleError);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleError);
    };
  }, [router]);

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <BarLoader />
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        </div>
      )}
      <Component {...pageProps} />
    </>
  );
}
