import { useState, useEffect } from 'react';
import { Building2, Plus, X } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  createdAt: string;
}

interface ClientSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api';

export function ClientSelector({
  value,
  onChange,
  placeholder = 'クライアントを選択または新規入力',
  className = '',
}: ClientSelectorProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewClientInput, setShowNewClientInput] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const { getAuth } = await import('firebase/auth');
      const { getApp } = await import('firebase/app');
      const app = getApp();
      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken(true);
      const response = await fetch(`${BASE_URL}/clients`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
      setError('クライアントリストの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;

    try {
      const { getAuth } = await import('firebase/auth');
      const { getApp } = await import('firebase/app');
      const app = getApp();
      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken(true);
      const response = await fetch(`${BASE_URL}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newClientName.trim() }),
      });

      if (response.ok) {
        const newClient = await response.json();
        setClients([...clients, newClient]);
        onChange(newClientName.trim());
        setNewClientName('');
        setShowNewClientInput(false);
      } else {
        setError('クライアントの追加に失敗しました');
      }
    } catch (err) {
      console.error('Failed to add client:', err);
      setError('クライアントの追加に失敗しました');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={value === '__new__' || showNewClientInput ? '' : value}
            onChange={(e) => {
              const selectedValue = e.target.value;
              if (selectedValue === '__new__') {
                setShowNewClientInput(true);
                onChange('');
              } else {
                setShowNewClientInput(false);
                onChange(selectedValue);
              }
            }}
            className={`w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
            disabled={loading}
          >
            <option value="" disabled hidden>{loading ? '読み込み中...' : placeholder}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.name}>
                {client.name}
              </option>
            ))}
            <option value="__new__">+ 新規クライアントを追加</option>
          </select>
        </div>
      </div>

      {showNewClientInput && (
        <div className="flex gap-2 items-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Building2 className="w-5 h-5 text-blue-600" />
          <input
            type="text"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddClient();
              }
            }}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="新規クライアント名を入力"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddClient}
            disabled={!newClientName.trim()}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewClientInput(false);
              setNewClientName('');
              onChange('');
            }}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
