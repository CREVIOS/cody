import { FileSystemItem } from "@/types/fileSystem";
import { FileTreeItem } from "./FileTreeItem";

interface SearchResultsProps {
    searchQuery: string;
    searchResults: FileSystemItem[];
    isSearching: boolean;
    onContextMenu: (event: React.MouseEvent, item: FileSystemItem) => void;
    onRename: (item: FileSystemItem) => void;
    isDark: boolean;
  }
  
export function SearchResults({ 
    searchQuery, 
    searchResults, 
    isSearching, 
    onContextMenu, 
    onRename, 
    isDark 
  }: SearchResultsProps) {
    return (
      <div>
        <div className={`px-3 py-2 text-xs font-medium uppercase tracking-wider border-b ${
          isDark 
            ? 'text-[#858585] border-[#3e3e42]' 
            : 'text-[#6c6c6c] border-[#e5e5e5]'
        }`}>
          Search Results ({searchResults.length})
        </div>
        {searchResults.length > 0 ? (
          searchResults.map((result) => (
            <FileTreeItem
              key={result.path}
              item={result}
              level={0}
              onContextMenu={onContextMenu}
              onRename={onRename}
            />
          ))
        ) : !isSearching ? (
          <div className={`px-3 py-2 text-sm ${
            isDark ? 'text-[#858585]' : 'text-[#6c6c6c]'
          }`}>
            No results found for &quot;{searchQuery}&quot;
          </div>
        ) : null}
      </div>
    );
  }
  