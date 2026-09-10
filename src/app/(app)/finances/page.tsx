'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useHousehold } from '@/components/household-provider';
import { cn } from '@/lib/utils';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Landmark,
  PieChart as PieIcon,
  Loader2,
  LayoutDashboard,
  Wallet,
} from 'lucide-react';
import FinanceOverview from '@/components/finance-overview';
import { ReportsTab } from './reports-tab';
import { IncomeTab } from './income-tab';
import { BudgetTab } from './budget-tab';
import { CashFlowTab } from './cash-flow-tab';
import { ReimbursementsTab } from './reimbursements-tab';
import { NetWorthTab } from './net-worth-tab';
import { InvestmentsTab } from './investments-tab';

const TABS = ['Overview', 'Income', 'Budget', 'Cash Flow', 'Reimbursements', 'Net Worth', 'Investments', 'Reports'] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  Overview: <LayoutDashboard className="w-4 h-4" />,
  Income: <Wallet className="w-4 h-4" />,
  Budget: <DollarSign className="w-4 h-4" />,
  'Cash Flow': <TrendingUp className="w-4 h-4" />,
  Reimbursements: <Receipt className="w-4 h-4" />,
  'Net Worth': <Landmark className="w-4 h-4" />,
  Investments: <PieIcon className="w-4 h-4" />,
  Reports: <Receipt className="w-4 h-4" />,
};

export default function FinancesPage() {
  const { user, loading: authLoading } = useAuth();
  const { householdId, canEditFinances } = useHousehold();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center text-zinc-400 py-20">Please sign in to view finances.</div>
    );
  }

  if (!householdId) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        <span className="text-zinc-400">Setting up household...</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Finances</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[44px]',
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            )}
          >
            {TAB_ICONS[tab]}
            {tab}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'Overview' && (
        <FinanceOverview householdId={householdId} />
      )}
      {activeTab === 'Income' && (
        <IncomeTab householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Budget' && (
        <BudgetTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Cash Flow' && (
        <CashFlowTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Reimbursements' && (
        <ReimbursementsTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Net Worth' && (
        <NetWorthTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Investments' && (
        <InvestmentsTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Reports' && (
        <ReportsTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
    </div>
  );
}
