import React from 'react';
import { Layers, ShoppingBag, UtensilsCrossed, Briefcase } from 'lucide-react';
import { PlatformMetadata } from '../types.js';

interface PlatformFilterProps {
  platforms: PlatformMetadata[];
  selectedPlatform: string;
  onSelectPlatform: (platformId: string) => void;
  platformCounts?: Record<string, number>;
}

export const PlatformFilter: React.FC<PlatformFilterProps> = ({
  platforms,
  selectedPlatform,
  onSelectPlatform,
  platformCounts = {},
}) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'retail_ecommerce':
        return <ShoppingBag size={16} />;
      case 'food_delivery':
        return <UtensilsCrossed size={16} />;
      case 'professional_services':
        return <Briefcase size={16} />;
      default:
        return <Layers size={16} />;
    }
  };

  const totalAll = Object.values(platformCounts).reduce((a, b) => a + b, 0);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      overflowX: 'auto',
      paddingBottom: 4,
      marginBottom: 20,
    }}>
      {/* All Platforms Tab */}
      <button
        onClick={() => onSelectPlatform('all')}
        className={`btn btn-sm ${selectedPlatform === 'all' ? 'btn-primary' : 'btn-secondary'}`}
        style={{
          borderRadius: 'var(--radius-full)',
          padding: '8px 16px',
          whiteSpace: 'nowrap',
        }}
      >
        <Layers size={15} />
        <span>All Products</span>
        {totalAll > 0 && (
          <span style={{
            fontSize: '0.7rem',
            padding: '1px 7px',
            borderRadius: 'var(--radius-full)',
            background: selectedPlatform === 'all' ? 'rgba(255,255,255,0.25)' : 'var(--border-subtle)',
            marginLeft: 4,
          }}>
            {totalAll}
          </span>
        )}
      </button>

      {/* Platform / Store Filters */}
      {platforms.map((platform) => {
        const isSelected = selectedPlatform === platform.id;
        const count = platformCounts[platform.id] || 0;

        return (
          <button
            key={platform.id}
            onClick={() => onSelectPlatform(platform.id)}
            className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              borderRadius: 'var(--radius-full)',
              padding: '8px 16px',
              whiteSpace: 'nowrap',
            }}
          >
            {getIcon(platform.type)}
            <span>{platform.name}</span>
            {count > 0 && (
              <span style={{
                fontSize: '0.7rem',
                padding: '1px 7px',
                borderRadius: 'var(--radius-full)',
                background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--border-subtle)',
                marginLeft: 4,
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
