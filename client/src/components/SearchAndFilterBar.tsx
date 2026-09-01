import React from 'react';
import { Search, X, ArrowUpDown } from 'lucide-react';
import { CatalogQueryFilters } from '../types.js';

interface SearchAndFilterBarProps {
  filters: CatalogQueryFilters;
  onFilterChange: (newFilters: Partial<CatalogQueryFilters>) => void;
  categories: { name: string; count: number }[];
  onClearFilters: () => void;
}

export const SearchAndFilterBar: React.FC<SearchAndFilterBarProps> = ({
  filters,
  onFilterChange,
  categories,
  onClearFilters,
}) => {
  const hasActiveFilters = !!(
    filters.query ||
    (filters.category && filters.category !== 'all') ||
    (filters.availability_status && filters.availability_status !== 'all') ||
    filters.min_price ||
    filters.max_price
  );

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      marginBottom: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Top Row: Search Input + Sorting & Status Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {/* Universal Search Input */}
        <div style={{
          position: 'relative',
          flex: 1,
          minWidth: 260,
        }}>
          <Search
            size={18}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Search products by name, description, or specifications..."
            value={filters.query || ''}
            onChange={(e) => onFilterChange({ query: e.target.value })}
            style={{
              width: '100%',
              padding: '11px 16px 11px 42px',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              outline: 'none',
              transition: 'border-color var(--transition-fast)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent-terracotta)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
          />
          {filters.query && (
            <button
              onClick={() => onFilterChange({ query: '' })}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Availability Filter Dropdown */}
        <select
          value={filters.availability_status || 'all'}
          onChange={(e) => onFilterChange({ availability_status: e.target.value })}
          style={{
            padding: '10px 14px',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Availability</option>
          <option value="in_stock">In Stock / Ready</option>
          <option value="low_stock">Low Stock (≤10)</option>
          <option value="available_slots">Available Slots (Services)</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>

        {/* Sort Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowUpDown size={15} color="var(--text-muted)" />
          <select
            value={filters.sort_by || 'created_at'}
            onChange={(e) => onFilterChange({ sort_by: e.target.value as any })}
            style={{
              padding: '10px 14px',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="created_at">Latest Additions</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating">Top Rated</option>
          </select>
        </div>

        {/* Reset Filter Button */}
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="btn btn-glass btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <X size={14} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Bottom Row: Dynamic Category Pills */}
      {categories.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          paddingTop: 4,
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>
            Categories:
          </span>
          <button
            onClick={() => onFilterChange({ category: 'all' })}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              fontWeight: 500,
              borderRadius: 'var(--radius-full)',
              border: '1px solid',
              borderColor: !filters.category || filters.category === 'all' ? 'var(--accent-terracotta)' : 'var(--border-subtle)',
              background: !filters.category || filters.category === 'all' ? 'rgba(217, 107, 67, 0.15)' : 'transparent',
              color: !filters.category || filters.category === 'all' ? 'var(--accent-terracotta)' : 'var(--text-muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            All Categories
          </button>

          {categories.map((cat) => {
            const isSelected = filters.category === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => onFilterChange({ category: cat.name })}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--accent-terracotta)' : 'var(--border-subtle)',
                  background: isSelected ? 'rgba(217, 107, 67, 0.15)' : 'transparent',
                  color: isSelected ? 'var(--accent-terracotta)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {cat.name} ({cat.count})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
