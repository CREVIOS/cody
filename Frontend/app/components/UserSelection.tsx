import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { listUsers, createUser } from "@/lib/projectAPI/UserAPI";
import { Skeleton } from "@/components/ui/skeleton";

interface UserSelectionProps {
  onSelectUser: (user: User) => void;
}

interface NewUserForm {
  username: string;
  email: string;
  password: string;
  full_name: string;
  avatar_url: string;
}

export default function UserSelection({ onSelectUser }: UserSelectionProps) {
  const { theme } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewUserForm>({
    username: '',
    email: '',
    password: '',
    full_name: '',
    avatar_url: ''
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true);
        const userList = await listUsers();
        setUsers(userList);
      } catch (err) {
        console.error('Failed to load users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  const backgroundClass = theme === "dark" 
    ? "bg-[#212124] text-[#E0E0E0]" 
    : "bg-[#F5F5F0] text-[#2D2D2D]";

  const cardClass = theme === "dark"
    ? "bg-[#2A2A2E] hover:bg-[#3A3A3E] border-[#3A3A3E]"
    : "bg-white hover:bg-gray-50 border-gray-200";

  const titleShadow = theme === "dark"
    ? "0 0 20px rgba(139, 92, 246, 0.6), 0 0 40px rgba(139, 92, 246, 0.3)"
    : "0 0 20px rgba(99, 102, 241, 0.3), 0 0 40px rgba(99, 102, 241, 0.1)";

  const inputClass = theme === "dark" 
    ? "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 mb-2 bg-[#212124] border-[#3A3A3E] text-[#E0E0E0]"
    : "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 mb-2 bg-white border-gray-300 text-[#2D2D2D]";

  const handleOpenModal = () => {
    setForm({ username: '', email: '', password: '', full_name: '', avatar_url: '' });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setFormError(null);
  };

  const handleFormChange = (field: keyof NewUserForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      if (!form.username || !form.email || !form.password) {
        setFormError('Username, email, and password are required.');
        setFormLoading(false);
        return;
      }
      await createUser(form);
      const userList = await listUsers();
      setUsers(userList);
      setShowModal(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-8 ${backgroundClass}`}>
      <h1 
        className="text-5xl font-bold mb-12"
        style={{ textShadow: titleShadow }}
      >
        Select a User
      </h1>
      <button
        onClick={handleOpenModal}
        className="mb-8 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
      >
        + Create New User
      </button>
      <div className="w-full max-w-4xl">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`p-6 rounded-xl border ${cardClass}`}>
                <Skeleton className="h-12 w-12 rounded-full mb-4" />
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {users.map((user) => (
              <button
                key={user.user_id}
                onClick={() => onSelectUser(user)}
                className={`p-6 rounded-xl border ${cardClass} transition-all duration-300 hover:shadow-lg hover:scale-105 text-left group cursor-pointer`}
              >
                <div className="flex items-center mb-4">
                  {user.avatar_url ? (
                    <img 
                      src={user.avatar_url} 
                      alt={user.username}
                      className="w-12 h-12 rounded-full mr-3"
                    />
                  ) : (
                    <div className={`w-12 h-12 rounded-full mr-3 flex items-center justify-center ${theme === "dark" ? "bg-indigo-500/30 text-indigo-200" : "bg-indigo-100 text-indigo-700"}`}>
                      <span className="text-xl font-semibold">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">{user.username}</h3>
                    <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      {user.email}
                    </p>
                  </div>
                </div>
                {user.full_name && (
                  <p className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                    {user.full_name}
                  </p>
                )}
                <div className={`mt-3 flex items-center text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                  <span className={`inline-block px-2 py-1 rounded-full ${user.status === 'active' ? theme === "dark" ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700" : theme === "dark" ? "bg-gray-500/20 text-gray-400" : "bg-gray-100 text-gray-700"}`}>
                    {user.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`w-full max-w-md mx-4 rounded-lg shadow-xl p-8 relative ${theme === "dark" ? "bg-[#2A2A2E] text-[#E0E0E0]" : "bg-white text-[#2D2D2D]"}`}>
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-2xl font-bold text-gray-400 hover:text-gray-700"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-2xl font-bold mb-6">Create New User</h2>
            <form onSubmit={handleFormSubmit}>
              <input
                className={inputClass}
                type="text"
                placeholder="Username"
                value={form.username}
                onChange={(e) => handleFormChange('username', e.target.value)}
                required
              />
              <input
                className={inputClass}
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => handleFormChange('email', e.target.value)}
                required
              />
              <input
                className={inputClass}
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => handleFormChange('password', e.target.value)}
                required
              />
              <input
                className={inputClass}
                type="text"
                placeholder="Full Name (optional)"
                value={form.full_name}
                onChange={(e) => handleFormChange('full_name', e.target.value)}
              />
              <input
                className={inputClass}
                type="url"
                placeholder="Avatar URL (optional)"
                value={form.avatar_url}
                onChange={(e) => handleFormChange('avatar_url', e.target.value)}
              />
              {formError && <div className="text-red-500 mb-2">{formError}</div>}
              <button
                type="submit"
                className="w-full py-2 mt-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-60"
                disabled={formLoading}
              >
                {formLoading ? 'Creating...' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}