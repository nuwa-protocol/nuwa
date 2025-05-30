import React from 'react';
import { Card, CardContent } from './card';
import { Button } from './button';
import { Shield } from 'lucide-react';

interface SybilLevelProps {
  level: number;
  showDescription?: boolean;
  showProgress?: boolean;
  verificationMethods?: string[];
}

export const SybilLevel: React.FC<SybilLevelProps> = ({
  level,
  showDescription = true,
  showProgress = true,
  verificationMethods = [],
}) => {
  const maxLevel = 4;
  const progress = (level / maxLevel) * 100;

  const getLevelColor = (currentLevel: number) => {
    switch (currentLevel) {
      case 0: return 'text-gray-500';
      case 1: return 'text-blue-500';
      case 2: return 'text-green-500';
      case 3: return 'text-purple-500';
      case 4: return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  const getLevelDescription = (currentLevel: number) => {
    switch (currentLevel) {
      case 0: return '未验证';
      case 1: return '基础验证';
      case 2: return '增强验证';
      case 3: return '高级验证';
      case 4: return '最高验证';
      default: return '未知等级';
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <Shield className={`h-8 w-8 ${getLevelColor(level)}`} />
          <div>
            <div className="text-lg font-semibold">
              等级 {level}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({getLevelDescription(level)})
              </span>
            </div>
            {showDescription && (
              <p className="text-sm text-muted-foreground">
                已完成 {verificationMethods.length} 项验证
              </p>
            )}
          </div>
        </div>

        {showProgress && (
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className={`h-2 rounded-full ${getLevelColor(level)}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {verificationMethods.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">已验证方式：</div>
            <div className="flex flex-wrap gap-2">
              {verificationMethods.map((method, index) => (
                <div
                  key={index}
                  className="px-2 py-1 bg-gray-100 rounded text-sm"
                >
                  {method}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <Button variant="outline" className="w-full">
            添加更多验证
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}; 