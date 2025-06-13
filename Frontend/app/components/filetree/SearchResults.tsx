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
          isDark ? 'text-gray-400 border-gray-700' : 'text-gray-600 border-gray-200'
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
          <div className="px-3 py-2 text-sm text-gray-500">
            No results found for &quot;{searchQuery}&quot;
          </div>
        ) : null}
      </div>
    );
  }
  