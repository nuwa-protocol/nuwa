import React from 'react';
import { useForm } from 'react-hook-form';
import { 
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
} from '@/components/ui';
import type { OperationalKeyInfo, VerificationRelationship } from '@nuwa-ai/identity-kit';
import { MultibaseCodec } from '@nuwa-ai/identity-kit';

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
  const form = useForm<VerificationMethodFormValues>({
    defaultValues: {
      type: initial?.type || 'Ed25519VerificationKey2020',
      publicKeyMultibase: initial?.publicKeyMultibase || '',
      relationships: initial?.relationships || [],
      idFragment: initial?.idFragment || `key-${Date.now()}`
    }
  });

  const handleSubmit = (values: VerificationMethodFormValues) => {
    onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Method Type</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Ed25519VerificationKey2020">Ed25519VerificationKey2020</SelectItem>
                  <SelectItem value="EcdsaSecp256k1VerificationKey2019">EcdsaSecp256k1VerificationKey2019</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="publicKeyMultibase"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Public Key (Base58)</FormLabel>
              <FormControl>
                <Input placeholder="z...." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="relationships"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Capabilities</FormLabel>
              <Select
                onValueChange={(value) => {
                  // Handle multi-select manually since shadcn/ui Select doesn't have built-in multi-select
                  const currentValues = field.value || [];
                  const newValues = currentValues.includes(value as VerificationRelationship)
                    ? currentValues.filter(v => v !== value)
                    : [...currentValues, value as VerificationRelationship];
                  field.onChange(newValues);
                }}
                value={field.value?.[0] || undefined} // Show first selected value
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select capabilities" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="authentication">authentication</SelectItem>
                  <SelectItem value="assertionMethod">assertionMethod</SelectItem>
                  <SelectItem value="capabilityInvocation">capabilityInvocation</SelectItem>
                  <SelectItem value="capabilityDelegation">capabilityDelegation</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1 mt-2">
                {field.value?.map(rel => (
                  <div key={rel} className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-md flex items-center">
                    {rel}
                    <button 
                      type="button"
                      className="ml-1 text-xs"
                      onClick={() => {
                        field.onChange(field.value?.filter(v => v !== rel));
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="idFragment"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID Fragment</FormLabel>
              <FormControl>
                <Input placeholder="key-123" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitText}
          </Button>
        </div>
      </form>
    </Form>
  );
} 