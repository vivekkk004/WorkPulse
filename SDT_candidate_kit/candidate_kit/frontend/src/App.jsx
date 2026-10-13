import { useEffect, useState } from 'react';
import AppShell from './components/AppShell';
import { Icon } from './components/dashboard-ui';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import AttendancePage from './pages/AttendancePage';
import AnalyticsPage from './pages/AnalyticsPage';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', section: 'Overview', icon: Icon.dashboard, Page: DashboardPage },
  { key: 'employees', label: 'Employees', section: 'Workforce', icon: Icon.users, Page: EmployeesPage },
  { key: 'attendance', label: 'Attendance', section: 'Operations', icon: Icon.clock, Page: AttendancePage },
  { key: 'analytics', label: 'Reports', section: 'Analytics', icon: Icon.chart, Page: AnalyticsPage },
];

const routeFromHash = () => {
  const key = window.location.hash.replace(/^#/, '').split('?')[0];
  return NAV.some((n) => n.key === key) ? key : 'dashboard';
};

export default function App() {
  const [route, setRoute] = useState(routeFromHash);

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const { Page } = NAV.find((n) => n.key === route);
  return (
    <AppShell nav={NAV} route={route} brandName="WorkPulse" areaTitle="WorkPulse Attendance" areaBadge="Company Workspace" userName="HR Admin" roleBadge="Company Admin">
      <Page />
    </AppShell>
  );
}
