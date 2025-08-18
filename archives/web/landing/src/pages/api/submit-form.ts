import { NextApiRequest, NextApiResponse } from 'next';
import { submitFormToAirtable, FormData } from '../../services/airtable';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // 只允许POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        // 从请求体中获取表单数据
        const formData: FormData = req.body;

        // 验证必要的字段
        if (!formData.email || !formData.agentname) {
            return res.status(400).json({
                success: false,
                message: 'Email and agentname are required'
            });
        }

        // 调用Airtable服务提交表单
        const success = await submitFormToAirtable(formData);

        if (success) {
            return res.status(200).json({ success: true });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Failed to submit form to Airtable'
            });
        }
    } catch (error) {
        console.error('Error in submit-form API:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
} 