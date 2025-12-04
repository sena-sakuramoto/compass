import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, List } from 'lucide-react';
import { listStages, createStage, updateStage, deleteStage, listProjects } from '../lib/api';
import type { Stage, Project } from '../lib/types';
import { StageDialog } from '../components/StageDialog';

export default function StagesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadStages();
    } else {
      setStages([]);
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const { projects: projectList } = await listProjects();
      setProjects(projectList);
      if (projectList.length > 0) {
        setSelectedProjectId(projectList[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setError('プロジェクトの読み込みに失敗しました');
    }
  };

  const loadStages = async () => {
    if (!selectedProjectId) return;

    try {
      setLoading(true);
      setError(null);
      const { stages: stageList } = await listStages(selectedProjectId);
      setStages(stageList);
    } catch (err: any) {
      console.error('Failed to load stages:', err);
      setError('工程の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingStage(null);
    setDialogOpen(true);
  };

  const handleEdit = (stage: Stage) => {
    setEditingStage(stage);
    setDialogOpen(true);
  };

  const handleSave = async (input: { タスク名: string; 予定開始日?: string | null; 期限?: string | null }) => {
    if (!selectedProjectId) return;

    if (editingStage) {
      // 更新
      await updateStage(editingStage.id, input);
    } else {
      // 新規作成
      await createStage(selectedProjectId, input);
    }

    await loadStages();
  };

  const handleDelete = async (stageId: string) => {
    if (!confirm('この工程を削除しますか？\n配下のタスクは未割り当てに戻ります。')) return;

    try {
      await deleteStage(stageId);
      await loadStages();
    } catch (err: any) {
      console.error('Failed to delete stage:', err);
      alert('工程の削除に失敗しました');
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-4">
          <List className="w-6 h-6" />
          工程管理
        </h1>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              プロジェクト
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">プロジェクトを選択</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.物件名}
                </option>
              ))}
            </select>
          </div>

          {selectedProjectId && (
            <button
              onClick={handleCreate}
              className="mt-7 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              工程を追加
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {!selectedProjectId ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <List className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">プロジェクトを選択してください</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      ) : stages.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <List className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">
            工程がまだ登録されていません
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            最初の工程を追加
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              {selectedProject?.物件名} の工程一覧
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {stages.length}件の工程
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {stages.map((stage) => (
              <div key={stage.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">{stage.タスク名}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      {stage.予定開始日 && (
                        <span>開始: {stage.予定開始日}</span>
                      )}
                      {stage.期限 && (
                        <span>期限: {stage.期限}</span>
                      )}
                      {!stage.予定開始日 && !stage.期限 && (
                        <span className="text-gray-400">日付未設定</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleEdit(stage)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="編集"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(stage.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <StageDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        stage={editingStage}
        projectId={selectedProjectId}
      />
    </div>
  );
}
