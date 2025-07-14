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
            className={`w-full pl-8 pr-10 py-2 text-sm rounded border transition-all duration-200 ${
              isDark 
                ? 'bg-[#3c3c3c] border-[#3e3e42] text-[#cccccc] placeholder-[#858585] focus:border-[#007acc] focus:bg-[#404040]' 
                : 'bg-[#ffffff] border-[#e5e5e5] text-[#383838] placeholder-[#6c6c6c] focus:border-[#005fb8] focus:bg-[#fafafa]'
            } outline-none focus:ring-2 ${
              isDark ? 'focus:ring-[#007acc]/20' : 'focus:ring-[#005fb8]/20'
            } focus:scale-[1.02]`}
          />
          <div className={`absolute left-2.5 top-1/2 transform -translate-y-1/2 transition-all duration-200 ${
            searchQuery ? 'scale-110' : ''
          }`}>
            <svg 
              width="14" 
              height="14" 
              viewBox="0 0 16 16" 
              fill="currentColor"
              className={`${isDark ? 'text-[#858585]' : 'text-[#6c6c6c]'}`}
            >
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
          </div>
          {isSearching && (
            <div className={`absolute right-2.5 top-1/2 transform -translate-y-1/2 ${
              isDark ? 'text-[#858585]' : 'text-[#6c6c6c]'
            }`}>
              <svg 
                width="14" 
                height="14" 
                viewBox="0 0 16 16" 
                fill="currentColor"
                className="animate-spin"
              >
                <path d="M8 0a8 8 0 0 1 8 8 .5.5 0 0 1-1 0 7 7 0 0 0-7-7 .5.5 0 0 1 0-1z"/>
              </svg>
            </div>
          )}
          {searchQuery && !isSearching && (
            <button
              onClick={() => onSearchChange('')}
              className={`absolute right-2.5 top-1/2 transform -translate-y-1/2 p-1 rounded transition-all duration-200 hover:scale-110 ${
                isDark 
                  ? 'text-[#858585] hover:text-[#cccccc] hover:bg-[#ffffff]/10' 
                  : 'text-[#6c6c6c] hover:text-[#383838] hover:bg-[#000000]/10'
              }`}
              title="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
  );
}