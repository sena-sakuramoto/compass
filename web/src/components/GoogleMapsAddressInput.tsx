import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

interface GoogleMapsAddressInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Google Maps APIキーを環境変数から取得
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export function GoogleMapsAddressInput({
  value,
  onChange,
  placeholder = '住所を入力',
  className = '',
}: GoogleMapsAddressInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Google Maps APIキーが設定されていない場合は通常の入力フィールドとして動作
    if (!GOOGLE_MAPS_API_KEY) {
      setError('Google Maps APIキーが設定されていません');
      return;
    }

    // Google Maps スクリプトが既にロード済みかチェック
    if ((window as any).google && (window as any).google.maps && (window as any).google.maps.places) {
      setIsLoaded(true);
      return;
    }

    // Google Maps スクリプトをロード
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&language=ja`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsLoaded(true);
    script.onerror = () => setError('Google Maps APIの読み込みに失敗しました');
    document.head.appendChild(script);

    return () => {
      // クリーンアップは不要（スクリプトは再利用される）
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    try {
      // Places Autocompleteを初期化
      const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'jp' }, // 日本のみ
        fields: ['name', 'address_components', 'formatted_address', 'geometry'],
        types: ['establishment', 'geocode'], // 施設名と住所の両方
      });

      // 場所が選択されたときのハンドラー
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        // 施設名がある場合は施設名を優先、なければ住所
        const displayValue = place.name || place.formatted_address;
        if (displayValue) {
          onChange(displayValue);
        }
      });
    } catch (err) {
      console.error('Google Maps Autocomplete initialization error:', err);
      setError('住所入力の初期化に失敗しました');
    }
  }, [isLoaded, onChange]);

  const handleMapClick = () => {
    if (value) {
      // Google Mapで検索を開く
      const encodedAddress = encodeURIComponent(value);
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleMapClick}
        disabled={!value}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-10 hover:text-blue-600 disabled:hover:text-gray-400 transition-colors"
        title={value ? 'Google Mapで開く' : ''}
      >
        <MapPin className="w-5 h-5 text-gray-400" />
      </button>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
        placeholder={placeholder}
      />
    </div>
  );
}

// Google Maps API型定義の拡張
declare global {
  interface Window {
    google: typeof google;
  }
}
