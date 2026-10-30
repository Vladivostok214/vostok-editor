import React, { useEffect } from 'react';
import { useProjectStore } from './store/useProjectStore';
import { HomeView } from './components/HomeView';
import { EditorWorkspace } from './components/EditorWorkspace';

export const App: React.FC = () => {
  const { view, fetchSystemStatus, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchSystemStatus();
    fetchProjects();
  }, [fetchSystemStatus, fetchProjects]);

  return view === 'home' ? <HomeView /> : <EditorWorkspace />;
};

export default App;
