import React, { useState, useEffect } from 'react';
import { X, User, Mail, UserCheck, Image, Save, AlertCircle } from 'lucide-react';
import { User as UserType } from '@/lib/projectAPI/TypeDefinitions';
import { updateProfile, ProfileUpdateData, getUser } from '@/lib/projectAPI/UserAPI';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  onProfileUpdated?: (updatedUser: UserType) => void;
  theme?: 'light' | 'dark';
}

interface FormData {
  username: string;
  email: string;
  full_name: string;
  avatar_url: string;
}

interface FormErrors {
  username?: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  general?: string;
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onProfileUpdated,
  theme = 'light'
}) => {
  const [formData, setFormData] = useState<FormData>({
    username: '',
    email: '',
    full_name: '',
    avatar_url: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Theme classes
  const isDark = theme === 'dark';
  const modalBg = isDark ? 'bg-[#2A2A2E]' : 'bg-white';
  const overlayBg = isDark ? 'bg-black/50' : 'bg-black/30';
  const textColor = isDark ? 'text-[#E0E0E0]' : 'text-[#2D2D2D]';
  const borderColor = isDark ? 'border-[#3A3A3E]' : 'border-gray-300';
  const inputBg = isDark ? 'bg-[#212124]' : 'bg-white';
  const inputFocus = isDark ? 'focus:border-indigo-500/50' : 'focus:border-indigo-500';
  const buttonPrimary = isDark ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-600 hover:bg-indigo-700';
  const buttonSecondary = isDark ? 'bg-[#3A3A3E] hover:bg-[#4A4A4E]' : 'bg-gray-200 hover:bg-gray-300';

  // Initialize form data when modal opens or user changes
  useEffect(() => {
    if (isOpen && user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
        full_name: user.full_name || '',
        avatar_url: user.avatar_url || ''
      });
      setErrors({});
    }
  }, [isOpen, user]);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters long';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'Username can only contain letters, numbers, and underscores';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (formData.avatar_url && formData.avatar_url.trim()) {
      try {
        new URL(formData.avatar_url);
      } catch {
        newErrors.avatar_url = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form input changes
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      // Prepare update data (only include changed fields)
      const updateData: ProfileUpdateData = {};
      
      if (formData.username !== user.username) {
        updateData.username = formData.username;
      }
      if (formData.email !== user.email) {
        updateData.email = formData.email;
      }
      if (formData.full_name !== (user.full_name || '')) {
        updateData.full_name = formData.full_name;
      }
      if (formData.avatar_url !== (user.avatar_url || '')) {
        updateData.avatar_url = formData.avatar_url;
      }

      // Only update if there are changes
      if (Object.keys(updateData).length === 0) {
        onClose();
        return;
      }

      const updatedUser = await updateProfile(user.user_id, updateData);
      
      // Call the callback with updated user data
      if (onProfileUpdated) {
        onProfileUpdated(updatedUser);
      }
      
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      setErrors({
        general: error instanceof Error ? error.message : 'Failed to update profile'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle modal close
  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${overlayBg}`}>
      <div className={`relative w-full max-w-md mx-4 ${modalBg} rounded-lg shadow-xl`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${borderColor}`}>
          <h2 className={`text-xl font-semibold ${textColor}`}>Edit Profile</h2>
          <button
            onClick={handleClose}
            disabled={isSaving}
            className={`p-2 rounded-full hover:bg-gray-100 ${isDark ? 'hover:bg-[#3A3A3E]' : 'hover:bg-gray-100'} transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* General Error */}
          {errors.general && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-red-700">{errors.general}</span>
            </div>
          )}

          {/* Username */}
          <div>
            <label className={`block text-sm font-medium ${textColor} mb-1`}>
              <User className="w-4 h-4 inline mr-2" />
              Username
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md ${inputBg} ${borderColor} ${inputFocus} ${textColor} focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
              placeholder="Enter your username"
              disabled={isSaving}
            />
            {errors.username && (
              <span className="text-sm text-red-500 mt-1">{errors.username}</span>
            )}
          </div>

          {/* Email */}
          <div>
            <label className={`block text-sm font-medium ${textColor} mb-1`}>
              <Mail className="w-4 h-4 inline mr-2" />
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md ${inputBg} ${borderColor} ${inputFocus} ${textColor} focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
              placeholder="Enter your email"
              disabled={isSaving}
            />
            {errors.email && (
              <span className="text-sm text-red-500 mt-1">{errors.email}</span>
            )}
          </div>

          {/* Full Name */}
          <div>
            <label className={`block text-sm font-medium ${textColor} mb-1`}>
              <UserCheck className="w-4 h-4 inline mr-2" />
              Full Name
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => handleInputChange('full_name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md ${inputBg} ${borderColor} ${inputFocus} ${textColor} focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
              placeholder="Enter your full name"
              disabled={isSaving}
            />
            {errors.full_name && (
              <span className="text-sm text-red-500 mt-1">{errors.full_name}</span>
            )}
          </div>

          {/* Avatar URL */}
          <div>
            <label className={`block text-sm font-medium ${textColor} mb-1`}>
              <Image className="w-4 h-4 inline mr-2" />
              Avatar URL
            </label>
            <input
              type="url"
              value={formData.avatar_url}
              onChange={(e) => handleInputChange('avatar_url', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md ${inputBg} ${borderColor} ${inputFocus} ${textColor} focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
              placeholder="Enter avatar image URL"
              disabled={isSaving}
            />
            {errors.avatar_url && (
              <span className="text-sm text-red-500 mt-1">{errors.avatar_url}</span>
            )}
          </div>

          {/* Avatar Preview
          {formData.avatar_url && (
            <div className="flex items-center gap-2">
              <span className={`text-sm ${textColor}`}>Preview:</span>
              <img
                src={formData.avatar_url}
                alt="Avatar preview"
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )} */}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className={`px-4 py-2 text-sm font-medium rounded-md ${buttonSecondary} ${textColor} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md ${buttonPrimary} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileModal; 