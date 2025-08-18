import Airtable from 'airtable';

// 初始化Airtable客户端
const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

// 定义表单数据的接口
export interface FormData {
    email: string;
    agentname: string;
    product?: string;
    description?: string;
}


// 提交表单数据到Airtable
export const submitFormToAirtable = async (formData: FormData): Promise<boolean> => {
    try {
        // 假设您的表名为"Contacts"
        const table = base('Early Access Registry');

        // 创建记录
        await table.create([
            {
                fields: {
                    Email: formData.email,
                    Agentname: formData.agentname,
                    Link: formData.product || '',
                    Description: formData.description || '',
                }
            }
        ]);

        return true;
    } catch (error) {
        console.error('Error submitting form to Airtable:', error);
        return false;
    }
};
