import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './card';
import { Button } from './button';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

export interface AuthMethod {
  id: string;
  type: 'passkey' | 'wallet' | 'email' | 'phone' | 'github' | 'twitter';
  title: string;
  description: string;
  sybilLevel: number;
  recommended?: boolean;
  icon: React.ReactNode;
  benefits: string[];
}

interface AuthMethodSelectorProps {
  methods: AuthMethod[];
  onSelect: (method: AuthMethod) => void;
  selectedMethod?: string;
  className?: string;
}

export const AuthMethodSelector: React.FC<AuthMethodSelectorProps> = ({
  methods,
  onSelect,
  selectedMethod,
  className,
}) => {
  return (
    <div className={cn("grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3", className)}>
      {methods.map((method) => (
        <Card
          key={method.id}
          className={cn(
            "cursor-pointer transition-all hover:shadow-lg",
            selectedMethod === method.id && "ring-2 ring-primary",
            method.recommended && "border-primary"
          )}
          onClick={() => onSelect(method)}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {method.icon}
                <CardTitle>{method.title}</CardTitle>
              </div>
              {method.recommended && (
                <Badge variant="secondary">推荐</Badge>
              )}
            </div>
            <CardDescription>{method.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Badge variant="outline">Sybil 等级 {method.sybilLevel}</Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                {method.benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center">
                    <span className="mr-2">•</span>
                    {benefit}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full mt-4"
                variant={selectedMethod === method.id ? "default" : "outline"}
                onClick={() => onSelect(method)}
              >
                {selectedMethod === method.id ? "已选择" : "选择"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}; 