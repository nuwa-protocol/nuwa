import { useState, useEffect } from 'react';
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
  FormMessage,
  CopyButton,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/ui';
import type { VerificationRelationship } from '@nuwa-ai/identity-kit';
import {
  generateKeyPair,
  methodTypeToKeyType,
  getKeyTypeDisplayName,
  type GeneratedKeyInfo,
} from '@/lib/crypto/keyGeneration';
import { Key, Shield, AlertTriangle, RefreshCw } from 'lucide-react';

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
  did?: string; // Required for key generation
}

export function VerificationMethodForm({
  initial,
  onSubmit,
  submitting,
  submitText = 'Submit',
  did,
}: Props) {
  const [generatedKey, setGeneratedKey] = useState<GeneratedKeyInfo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isFormModified, setIsFormModified] = useState(false);
  const [originalGeneratedParams, setOriginalGeneratedParams] = useState<{
    fragment: string;
    type: string;
  } | null>(null);

  const form = useForm<VerificationMethodFormValues>({
    defaultValues: {
      type: initial?.type || 'Ed25519VerificationKey2020',
      publicKeyMultibase: initial?.publicKeyMultibase || '',
      relationships: initial?.relationships || [],
      idFragment: initial?.idFragment || `key-${Date.now()}`,
    },
  });

  // Watch form changes to detect if user modified generated key parameters
  const watchedFragment = form.watch('idFragment');
  const watchedType = form.watch('type');

  useEffect(() => {
    if (generatedKey && originalGeneratedParams) {
      const fragmentChanged = watchedFragment !== originalGeneratedParams.fragment;
      const typeChanged = watchedType !== originalGeneratedParams.type;
      setIsFormModified(fragmentChanged || typeChanged);
    }
  }, [watchedFragment, watchedType, generatedKey, originalGeneratedParams]);

  const handleSubmit = (values: VerificationMethodFormValues) => {
    onSubmit(values);
  };

  const handleGenerateKey = async () => {
    if (!did) {
      setGenerationError('DID is required for key generation');
      return;
    }

    setGenerating(true);
    setGenerationError(null);

    try {
      const selectedType = form.getValues('type');
      const keyType = methodTypeToKeyType(selectedType);
      const fragment = form.getValues('idFragment') || `key-${Date.now()}`;

      const keyInfo = await generateKeyPair(did, keyType, fragment);
      setGeneratedKey(keyInfo);

      // Store original parameters for comparison
      setOriginalGeneratedParams({
        fragment: keyInfo.idFragment,
        type: selectedType,
      });

      // Auto-fill the form with generated values
      form.setValue('publicKeyMultibase', keyInfo.publicKeyMultibase);
      form.setValue('idFragment', keyInfo.idFragment);
      form.setValue('type', getKeyTypeDisplayName(keyInfo.keyType));

      // Reset modification flag
      setIsFormModified(false);

      // Set default relationships for authentication
      if (!form.getValues('relationships').length) {
        form.setValue('relationships', ['authentication', 'capabilityInvocation']);
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate key');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!did || !generatedKey) return;

    setGenerating(true);
    setGenerationError(null);

    try {
      const selectedType = form.getValues('type');
      const keyType = methodTypeToKeyType(selectedType);
      const fragment = form.getValues('idFragment') || `key-${Date.now()}`;

      const keyInfo = await generateKeyPair(did, keyType, fragment);
      setGeneratedKey(keyInfo);

      // Update original parameters
      setOriginalGeneratedParams({
        fragment: keyInfo.idFragment,
        type: selectedType,
      });

      // Update form with new values
      form.setValue('publicKeyMultibase', keyInfo.publicKeyMultibase);

      // Reset modification flag
      setIsFormModified(false);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to regenerate key');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Key Generation Section */}
        {did && (
          <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
            <div className="flex items-center gap-2 mb-3">
              <Key className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Generate New Key Pair
              </h4>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
              Generate a new cryptographic key pair for this DID. The private key will be provided
              as a Service Key for server deployment.
            </p>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleGenerateKey}
                disabled={generating || submitting}
                className="mb-3"
              >
                {generating ? (
                  <>
                    <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-3 w-3" />
                    Generate Key Pair
                  </>
                )}
              </Button>

              {generatedKey && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRegenerateKey}
                  disabled={generating || submitting}
                  className="mb-3"
                >
                  {generating ? (
                    <>
                      <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Regenerate Service Key
                    </>
                  )}
                </Button>
              )}
            </div>

            {generationError && (
              <Alert variant="destructive" className="mb-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Generation Failed</AlertTitle>
                <AlertDescription>{generationError}</AlertDescription>
              </Alert>
            )}

            {generatedKey && (
              <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
                <Shield className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">
                  Service Key Generated
                </AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                    <strong>Important:</strong> Copy and save the Service Key immediately. You
                    won&apos;t be able to view it again.
                  </p>

                  {isFormModified && (
                    <Alert variant="destructive" className="mb-3">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Service Key Outdated</AlertTitle>
                      <AlertDescription>
                        The form has been modified after key generation. The Service Key below may
                        not match the current form values.{' '}
                        <Button
                          type="button"
                          variant="link"
                          className="p-0 h-auto ml-1 text-red-600 underline"
                          onClick={handleRegenerateKey}
                          disabled={generating}
                        >
                          Regenerate with current values
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="bg-white dark:bg-gray-800 border rounded p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-mono break-all pr-2 text-gray-700 dark:text-gray-300">
                        {generatedKey.storedKeyString}
                      </code>
                      <CopyButton
                        value={generatedKey.storedKeyString}
                        variant="outline"
                        size="sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Add this to your server environment variables:{' '}
                    <code>SERVICE_KEY=&quot;&lt;copied_value&gt;&quot;</code>
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Method Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Ed25519VerificationKey2020">
                    Ed25519VerificationKey2020
                  </SelectItem>
                  <SelectItem value="EcdsaSecp256k1VerificationKey2019">
                    EcdsaSecp256k1VerificationKey2019
                  </SelectItem>
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
                <Input
                  placeholder="z...."
                  {...field}
                  readOnly={!!generatedKey}
                  className={generatedKey ? 'bg-gray-50 dark:bg-gray-900' : ''}
                />
              </FormControl>
              {generatedKey && (
                <p className="text-xs text-gray-500">
                  This field was auto-filled from the generated key pair above.
                </p>
              )}
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
                onValueChange={value => {
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
                  <div
                    key={rel}
                    className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-md flex items-center"
                  >
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
