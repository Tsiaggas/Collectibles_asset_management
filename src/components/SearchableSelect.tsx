import React, { useState, useMemo, useRef, useEffect } from 'react';

type OptionGroup = {
  label: string;
  options: string[];
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  groups: OptionGroup[];
  placeholder?: string;
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  groups,
  placeholder = "Select an option",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);
  
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groups;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    return groups.map(group => {
      const filteredOptions = group.options.filter(option =>
        option.toLowerCase().includes(lowerCaseSearchTerm)
      );
      return { ...group, options: filteredOptions };
    }).filter(group => group.options.length > 0);
  }, [searchTerm, groups]);

  const handleSelect = (option: string) => {
    onChange(option);
    setSearchTerm("");
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        className="input w-full"
        placeholder={value || placeholder}
        value={searchTerm || value}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
          // If user types, we clear the actual value until a selection is made
          if (e.target.value !== '') {
            onChange('');
          }
        }}
      />
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredGroups.length > 0 ? (
            <ul>
              {filteredGroups.map(group => (
                <li key={group.label}>
                  <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 select-none">
                    {group.label}
                  </div>
                  <ul>
                    {group.options.map(option => (
                      <li
                        key={option}
                        className="px-3 py-2 cursor-pointer hover:bg-indigo-500 hover:text-white"
                        onClick={() => handleSelect(option)}
                      >
                        {option}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">No results found</div>
          )}
        </div>
      )}
    </div>
  );
};
