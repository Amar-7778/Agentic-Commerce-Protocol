import React, { useState, useEffect } from 'react';
import { Sidebar, SidebarSection } from './components/Sidebar.js';
import { ShopperAssistant } from './components/ShopperAssistant.js';
import { RevenueDashboard } from './components/RevenueDashboard.js';
import { PlatformFilter } from './components/PlatformFilter.js';
import { SearchAndFilterBar } from './components/SearchAndFilterBar.js';
import { InventoryTable } from './components/InventoryTable.js';
import { OrdersView } from './components/OrdersView.js';
import { ItemDetailModal } from './components/ItemDetailModal.js';
import { SchemaMappingModal } from './components/SchemaMappingModal.js';
import { SimulateIngestionModal } from './components/SimulateIngestionModal.js';
import { MerchantCampaignPage } from './components/MerchantCampaignPage.js';
import { GovernancePage } from './components/GovernancePage.js';

import {
  UniversalItem,
  PlatformMetadata,
  CatalogStats,
  CatalogQueryFilters,
  OrderSummary,
  RevenueAnalytics,
  PublicConfig,
} from './types.js';
import {
  fetchCatalogItems,
  fetchPlatforms,
  fetchStats,
  fetchOrders,
  fetchRevenueAnalytics,
  fetchPublicConfig,
} from './services/api.js';

export const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SidebarSection>('shopper');

  const [items, setItems] = useState<UniversalItem[]>([]);
  const [platforms, setPlatforms] = useState<PlatformMetadata[]>([]);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters State
  const [filters, setFilters] = useState<CatalogQueryFilters>({
    query: '',
    platform_id: 'all',
    category: 'all',
    availability_status: 'all',
    sort_by: 'created_at',
  });

  // Modals
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<UniversalItem | null>(null);
  const [selectedItemForSchema, setSelectedItemForSchema] = useState<UniversalItem | null>(null);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState<boolean>(false);

  // Categories extracted from search response
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [platformCounts, setPlatformCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadMetadata();
    loadOrders();
    fetchPublicConfig().then(setPublicConfig).catch((e) => console.warn('Failed to load public config:', e));
  }, []);

  useEffect(() => {
    if (activeSection === 'overview' || activeSection === 'inventory') {
      loadItems();
    }
  }, [filters, activeSection]);

  const loadMetadata = async () => {
    try {
      const [plats, st, rev] = await Promise.all([fetchPlatforms(), fetchStats(), fetchRevenueAnalytics()]);
      setPlatforms(plats);
      setStats(st);
      setRevenue(rev);
    } catch (e) {
      console.error('Failed to load metadata:', e);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const list = await fetchOrders(50);
      setOrders(list);
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await fetchCatalogItems(filters);
      setItems(response.items);
      setCategories(response.categories || []);

      // Calculate platform item counts
      const counts: Record<string, number> = {};
      response.items.forEach((item) => {
        counts[item.platform_id] = (counts[item.platform_id] || 0) + 1;
      });
      setPlatformCounts(counts);
    } catch (e) {
      console.error('Failed to load catalog items:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: Partial<CatalogQueryFilters>) => {
    setFilters((prev: CatalogQueryFilters) => ({ ...prev, ...newFilters }));
  };

  const handleClearFilters = () => {
    setFilters({
      query: '',
      platform_id: 'all',
      category: 'all',
      availability_status: 'all',
      sort_by: 'created_at',
    });
  };

  const handleIngestSuccess = () => {
    loadMetadata();
    loadItems();
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        stats={stats}
        config={publicConfig}
      />

      <div style={{ flex: 1, minWidth: 0, height: '100vh', overflow: activeSection === 'shopper' ? 'hidden' : 'auto' }}>
        {activeSection === 'shopper' && <ShopperAssistant config={publicConfig} />}

        {activeSection !== 'shopper' && (
          <main className="main-content">
            {activeSection === 'overview' && (
              <RevenueDashboard revenue={revenue} catalogStats={stats} />
            )}

            {activeSection === 'inventory' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <button onClick={() => setIsAddProductModalOpen(true)} className="btn btn-primary btn-sm">
                    Ingest Item
                  </button>
                </div>
                <PlatformFilter
                  platforms={platforms}
                  selectedPlatform={filters.platform_id || 'all'}
                  onSelectPlatform={(pId) => handleFilterChange({ platform_id: pId, category: 'all' })}
                  platformCounts={platformCounts}
                />
                <SearchAndFilterBar
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  categories={categories}
                  onClearFilters={handleClearFilters}
                />
                <InventoryTable
                  items={items}
                  loading={loading}
                  onInspectSchema={(item) => setSelectedItemForSchema(item)}
                  onViewDetails={(item) => setSelectedItemForDetails(item)}
                  onResetFilters={handleClearFilters}
                />
              </>
            )}

            {activeSection === 'orders' && (
              <OrdersView
                orders={orders}
                loading={ordersLoading}
                onInspectAudit={() => setActiveSection('governance')}
              />
            )}

            {activeSection === 'campaigns' && <MerchantCampaignPage />}

            {activeSection === 'governance' && <GovernancePage />}
          </main>
        )}
      </div>

      {/* Item Details Modal */}
      {selectedItemForDetails && (
        <ItemDetailModal
          item={selectedItemForDetails}
          onClose={() => setSelectedItemForDetails(null)}
          onInspectSchema={(item) => setSelectedItemForSchema(item)}
        />
      )}

      {/* Product Specifications Modal */}
      {selectedItemForSchema && (
        <SchemaMappingModal
          item={selectedItemForSchema}
          onClose={() => setSelectedItemForSchema(null)}
        />
      )}

      {/* Add Products Modal */}
      {isAddProductModalOpen && (
        <SimulateIngestionModal
          platforms={platforms}
          onClose={() => setIsAddProductModalOpen(false)}
          onIngestSuccess={handleIngestSuccess}
        />
      )}
    </div>
  );
};
