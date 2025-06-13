interface SearchBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isSearching: boolean;
    isDark: boolean;
  }
  
export function SearchBar({ searchQuery, onSearchChange, isSearching, isDark }: SearchBarProps) {
    return (
      <div className="p-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 text-sm rounded border transition-colors ${
              isDark 
                ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500' 
                : 'bg-white border-gray-300 text-black placeholder-gray-500 focus:border-blue-500'
            } outline-none focus:ring-1 focus:ring-blue-500/20`}
          />
          <span className={`absolute left-2.5 top-1/2 transform -translate-y-1/2 text-sm ${
            isDark ? 'text-gray-400' : 'text-gray-500'
          }`}>
            🔍
          </span>
          {isSearching && (
            <span className={`absolute right-2.5 top-1/2 transform -translate-y-1/2 text-sm ${
              isDark ? 'text-gray-400' : 'text-gray-500'
            }`}>
              ⏳
            </span>
          )}
        </div>
      </div>
  );
}