# LiteLLM Kubernetes Deployment Guide

This guide describes how to deploy and operate the **LiteLLM** service on
Kubernetes.

## Files

- `kubernetes.yaml` – Base Kubernetes resources, including **Secret**,
  **Deployment**, **Service**, and **Ingress**.
- `config.yaml` – LiteLLM configuration file.
- `update-config.sh` – Script that updates the `ConfigMap` with a new
  `config.yaml`.
- `update-env.sh` – Script that bulk-updates environment variables from a `.env`
  file.
- `env.example` – Sample environment-variable file.
- `generate-master-key.sh` – Script that generates a secure `MASTER_KEY`.

---

## Deployment Steps

We keep configuration outside of the container image so that it can be managed
independently. All resources live in the `nuwa` namespace.

1. **Create the `nuwa` namespace**

   ```bash
   kubectl create namespace nuwa
   ```

2. **Reserve a static IP on GCP (optional)** If you are running on Google Cloud,
   reserve a global static IP so the domain name stays stable:

   ```bash
   # Reserve a global static IP
   gcloud compute addresses create litellm-ingress-static-ip --global

   # Verify the reserved IP
   gcloud compute addresses describe litellm-ingress-static-ip --global
   ```

   Make a note of the allocated IP address; you will add a DNS record for it
   later.

3. **Generate a secure `MASTER_KEY` (recommended)**

   ```bash
   chmod +x generate-master-key.sh
   ./generate-master-key.sh
   ```

   The script outputs a secure random key that starts with `sk-` and offers to
   append it to your `.env` file.

4. **Configure environment variables**

   ```bash
   # Copy the example file and edit it
   cp env.example .env
   # Open .env and fill in actual values

   # Apply the variables to Kubernetes
   chmod +x update-env.sh
   ./update-env.sh
   ```

5. **Update the LiteLLM configuration**

   ```bash
   chmod +x update-config.sh
   ./update-config.sh
   ```

6. **Deploy the Kubernetes resources**

   ```bash
   kubectl apply -f kubernetes.yaml
   ```

7. **Configure DNS** Create an **A** record for your domain (for example
   `litellm.nuwa.dev`) that points to the static IP from step 2.

   > DNS propagation can take anywhere from a few minutes to several hours,
   > depending on your provider.

---

## Updating Configuration

### Update `config.yaml`

1. Edit your local `config.yaml`.
2. Run `./update-config.sh` to push the change to the cluster.
3. The script automatically restarts the Deployment so the new configuration is
   loaded.

### Update environment variables

Environment variables are managed with a `.env` file:

1. Create or modify `.env` and add one variable per line, e.g.
   ```
   OPENAI_API_KEY=sk-your-openai-key
   OPENAI_API_BASE=https://api.openai.com/v1
   MASTER_KEY=sk-your-master-key
   DATABASE_URL=postgresql://user:password@localhost:5432/litellm
   ```
2. Apply all variables:
   ```bash
   ./update-env.sh
   ```
3. If your `.env` is in a different directory, pass the path explicitly:
   ```bash
   ./update-env.sh /path/to/your/.env
   ```

The script will:

1. Read all variables from the file.
2. Base-64 encode each value.
3. Create or update the `litellm-env` **Secret**.
4. Restart the Deployment so the changes take effect.

### Generate a secure `MASTER_KEY`

`MASTER_KEY` is used for LiteLLM API authentication. It **must** be a secure
random string that starts with `sk-`. You can use the script mentioned earlier
or generate one manually:

```bash
# Generate the random portion
RANDOM_PART=$(openssl rand -base64 32 | tr -d '\n' | tr -d '=' | tr '+/' '-_' | cut -c 1-48)
# Add the sk- prefix
echo "sk-${RANDOM_PART}"
```

---

## Automatic Environment Variable Injection

The Kubernetes manifest uses `envFrom` to inject **all** key–value pairs from
the `litellm-env` Secret into the container. Therefore:

1. New variables added by the script are automatically available to LiteLLM.
2. You do **not** need to edit the Deployment to reference individual variables.
3. You can easily manage multiple API keys, database URLs, and other settings.

This approach dramatically simplifies management, especially when you work with
multiple LLM providers or other external services.

---

## Logs

```bash
kubectl logs -f deployment/litellm -n nuwa
```

---

## Accessing the Service

After DNS propagation, the service is reachable via the domain you configured in
the Ingress (e.g. `litellm.nuwa.dev`).

---

## Troubleshooting

### No IP assigned to the Ingress

If `kubectl get ingress -n nuwa` shows no IP, check the following:

1. **Inspect Ingress details**

   ```bash
   kubectl describe ingress litellm-ingress -n nuwa
   ```

   Look for errors in the **Events** section.

2. **Verify the static IP exists** (GCP)

   ```bash
   gcloud compute addresses list
   ```

   If it is missing, create it:

   ```bash
   gcloud compute addresses create litellm-ingress-static-ip --global
   ```

3. **Check ManagedCertificate status**

   ```bash
   kubectl describe managedcertificate litellm-cert -n nuwa
   ```

4. **Validate the Ingress controller**

   ```bash
   kubectl get pods -n kube-system | grep ingress
   ```

5. **Confirm DNS settings** Make sure your domain's **A** record points to the
   reserved IP:

   ```bash
   nslookup litellm.nuwa.dev
   ```

6. **Wait for DNS and certificate issuance** After DNS resolves,
   `ManagedCertificate` needs time to validate ownership and issue the
   certificate.

### Certificate issues

If the Ingress has an IP but HTTPS fails:

1. **Check the certificate status**

   ```bash
   kubectl describe managedcertificate litellm-cert -n nuwa
   ```

2. **Verify domain ownership** Ensure DNS is configured correctly so that Google
   can validate ownership.

3. **Allow time for issuance** Certificate issuance can take several minutes to
   a few hours.

---

## Notes

- All resources reside in the `nuwa` namespace.
- Make sure the GCP static IP `litellm-ingress-static-ip` is reserved.
- If you use another Kubernetes provider, adjust the Ingress annotations and the
  `ManagedCertificate` resource accordingly.
- For security, never commit sensitive environment variables to version control.
- Add `.env` to `.gitignore`.
- Before deploying, change the domain in `kubernetes.yaml` to your own domain.
