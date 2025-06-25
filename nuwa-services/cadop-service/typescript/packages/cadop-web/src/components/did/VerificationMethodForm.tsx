import React from 'react';
import { Form, Input, Select, Button } from 'antd';
import type { OperationalKeyInfo, VerificationRelationship } from '@nuwa-ai/identity-kit';
import { MultibaseCodec } from '@nuwa-ai/identity-kit';

const { Option } = Select;

export interface VerificationMethodFormValues {
  type: string;
  publicKeyMultibase: string;
  relationships: VerificationRelationship[];
  idFragment?: string;
}

interface Props {
  initial?: Partial<VerificationMethodFormValues>;
  onSubmit: (values: VerificationMethodFormValues) => void;
  submitting?: boolean;
  submitText?: string;
}

export function VerificationMethodForm({ initial, onSubmit, submitting, submitText = 'Submit' }: Props) {
  const [form] = Form.useForm();

  const handleFinish = (values: any) => {
    const cleaned: VerificationMethodFormValues = {
      type: values.type,
      publicKeyMultibase: values.publicKey,
      relationships: values.relationships,
      idFragment: values.idFragment || `key-${Date.now()}`,
    };
    onSubmit(cleaned);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        type: initial?.type,
        publicKey: initial?.publicKeyMultibase,
        relationships: initial?.relationships,
        idFragment: initial?.idFragment ?? `key-${Date.now()}`,
      }}
      onFinish={handleFinish}
    >
      <Form.Item name="type" label="Method Type" rules={[{ required: true }]}>
        <Select>
          <Option value="Ed25519VerificationKey2020">Ed25519VerificationKey2020</Option>
          <Option value="EcdsaSecp256k1VerificationKey2019">EcdsaSecp256k1VerificationKey2019</Option>
        </Select>
      </Form.Item>

      <Form.Item name="publicKey" label="Public Key (Base58)" rules={[{ required: true }]}>
        <Input placeholder="z...." />
      </Form.Item>

      <Form.Item name="relationships" label="Capabilities" rules={[{ required: true }]}>
        <Select mode="multiple">
          <Option value="authentication">authentication</Option>
          <Option value="assertionMethod">assertionMethod</Option>
          <Option value="capabilityInvocation">capabilityInvocation</Option>
          <Option value="capabilityDelegation">capabilityDelegation</Option>
        </Select>
      </Form.Item>

      <Form.Item name="idFragment" label="ID Fragment" rules={[{ required: true }]}>
        <Input placeholder="key-123" />
      </Form.Item>

      <div className="flex justify-end">
        <Button type="primary" htmlType="submit" loading={submitting}>
          {submitText}
        </Button>
      </div>
    </Form>
  );
} 