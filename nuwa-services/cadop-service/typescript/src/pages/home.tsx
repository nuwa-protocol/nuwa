import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SybilLevel } from '@/components/ui/sybil-level';
import { DIDDisplay } from '@/components/ui/did-display';
import { Plus, Shield, Settings } from 'lucide-react';

export const HomePage: React.FC = () => {
  // 示例数据
  const mockDid = 'did:nuwa:0x1234567890abcdef';
  const mockVerificationMethods = ['Passkey', 'GitHub', 'Email'];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">欢迎使用 Nuwa CADOP 服务</h1>
          <p className="text-muted-foreground mt-2">
            创建和管理您的 DID，增强您的 Web3 身份
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Plus className="w-5 h-5 mr-2" />
              创建新 DID
            </CardTitle>
            <CardDescription>
              开始创建您的新 DID 身份
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">开始创建</Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              验证身份
            </CardTitle>
            <CardDescription>
              增加更多验证方式，提升 Sybil 等级
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">添加验证</Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              管理 DID
            </CardTitle>
            <CardDescription>
              管理您的 DID 和验证信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">管理</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-4">当前 DID</h2>
          <DIDDisplay
            did={mockDid}
            showCopy
            showQR
            sybilLevel={2}
            status="active"
          />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Sybil 防护状态</h2>
          <SybilLevel
            level={2}
            showDescription
            showProgress
            verificationMethods={mockVerificationMethods}
          />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">最近活动</h2>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {[
                { time: '2024-01-20 14:30', action: '添加了 GitHub 验证' },
                { time: '2024-01-19 10:15', action: '创建了新的 DID' },
                { time: '2024-01-18 16:45', action: '完成了 Passkey 设置' },
              ].map((activity, index) => (
                <div key={index} className="p-4">
                  <div className="text-sm text-muted-foreground">
                    {activity.time}
                  </div>
                  <div className="mt-1">{activity.action}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
    </div>
  );
}; 