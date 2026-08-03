'use client';

import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import styles from './SearchInput.module.css';

interface SearchInputProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  id?: string;
}

/**
 * Animated search bar.
 */
export const SearchInput: React.FC<SearchInputProps> = ({
  placeholder = 'Search...',
  value,
  onChange,
  onClear,
  id
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className={`${styles.container} ${isFocused ? styles.focused : ''}`}>
      <Search className={styles.searchIcon} size={18} />
      <input
        id={id || "search-input"}
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      {value && onClear && (
        <button 
          className={styles.clearBtn} 
          onClick={onClear}
          id={`${id || 'search-input'}-clear-btn`}
          type="button"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
