import { bcs, RoochAddress } from "@roochnetwork/rooch-sdk";

export type ArgumentType = 'String' | 'Number' | 'Boolean'

export interface TaskArgument {
    name: string
    type: ArgumentType
    type_desc?: string
    description: string
    required?: boolean
}

export interface Task {
    id: string
    name: string
    description?: string
    arguments: TaskArgument[]
    resolverAddress: string
    isOnChain: boolean
    price: number
}

export interface TaskFormData {
    name: string
    description: string
    arguments: TaskArgument[]
    resolverAddress: string
    isOnChain: boolean
    price: number
}

export interface TaskExecution {
    id: string;
    taskId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    result?: any;
    error?: string;
    arguments: Record<string, any>;
}

export interface TaskExecutionResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface TaskQueryParams {
    page?: number;
    limit?: number;
    status?: TaskExecution['status'];
    taskId?: string;
}

export interface TaskPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface TaskListResponse {
    tasks: Task[];
    pagination: TaskPagination;
}

export interface TaskSpecification {
    name: string;
    description: string;
    arguments: TaskArgument[];
    resolver: string;
    on_chain: boolean;
    price: string;  // DecimalValue represented as string
}

export const TaskArgumentSchema = bcs.struct('TaskArgument', {
    name: bcs.string(),
    type_desc: bcs.string(),
    description: bcs.string(),
    required: bcs.bool(),
});

export const DecimalValueSchema = bcs.struct('DecimalValue', {
    value: bcs.u64(),
    decimals: bcs.u8(),
});

export const TaskSpecificationSchema = bcs.struct('TaskSpecification', {
    name: bcs.string(),
    description: bcs.string(),
    arguments: bcs.vector(TaskArgumentSchema),
    resolver: bcs.Address,
    on_chain: bcs.bool(),
    price: DecimalValueSchema,
});

export const TaskSpecificationsSchema = bcs.struct('TaskSpecifications', {
    task_specs: bcs.vector(TaskSpecificationSchema),
});

export function deserializeTaskSpecifications(hexValue: string): TaskSpecification[] {
    const cleanHexValue = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
    const bytes = new Uint8Array(
        cleanHexValue.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    console.log('bytes', bytes);

    const decoded = TaskSpecificationsSchema.parse(bytes);
    return decoded.task_specs.map(spec => ({
        ...spec,
        resolver: new RoochAddress(spec.resolver).toBech32Address(),
        price: Number(BigInt(spec.price.value) / BigInt(10 ** spec.price.decimals)).toString(),
        arguments: spec.arguments.map(arg => ({
            name: arg.name,
            type: arg.type_desc as ArgumentType,
            description: arg.description,
            required: arg.required
        }))
    }));
} 