import path from 'path';
import { syncAllBlogPosts } from '../src/app/services/blogSyncService';
import dotenv from 'dotenv';
import fs from 'fs';

// Detect CI/Vercel environment
const isVercel = process.env.VERCEL === '1';
const isCI = process.env.CI === 'true' || isVercel;

// Parse command line arguments
const args = process.argv.slice(2);
const forceSync = args.includes('--force') || args.includes('-f');

// Load environment variables - only in non-CI environments
function loadEnvFiles() {
  if (isVercel) {
    console.log('Running in Vercel environment, using system environment variables.');
    return true;
  }
  
  if (isCI) {
    console.log('Running in CI environment, using system environment variables.');
    return true;
  }
  
  // Local development: try loading .env.local or .env
  const envFiles = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env')
  ];
  
  let loaded = false;
  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      console.log(`Loading environment from: ${envPath}`);
      dotenv.config({ path: envPath });
      loaded = true;
      break;
    }
  }
  
  if (!loaded) {
    console.warn('No .env or .env.local file found. Using only process environment variables.');
  }
  
  return loaded;
}

// Load environment files (only in non-CI environments)
loadEnvFiles();

// Check required environment variables
function checkEnvironmentVariables() {
  const requiredVars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    
    if (isVercel) {
      console.error('Please add these environment variables in Vercel project settings:');
      console.error('  Settings > Environment Variables');
      console.error(`  ${missingVars.join('\n  ')}`);
    } else if (isCI) {
      console.error('Please add these environment variables to your CI configuration.');
    } else {
      console.error('Please check your .env or .env.local file and ensure these variables are set:');
      console.error(`  ${missingVars.join('\n  ')}`);
    }
    
    // Don't exit process during build to allow the build to continue
    console.error('Continuing build without blog syncing...');
    return false;
  }
  
  return true;
}

async function main() {
  const syncMode = forceSync ? 'full' : 'incremental';
  console.log(`🔄 Starting ${syncMode} blog sync as part of the build process... [Environment: ${isVercel ? 'Vercel' : (isCI ? 'CI' : 'Local')}]`);
  
  if (!checkEnvironmentVariables()) {
    return;
  }

  // Determine blog directory path
  let blogDir;
  if (isVercel) {
    // In Vercel, try multiple possible paths
    const possiblePaths = [
      path.resolve(process.cwd(), 'landing/src/content/blog'),
      path.resolve(process.cwd(), '../landing/src/content/blog'),
      path.resolve(process.cwd(), '../../landing/src/content/blog')
    ];
    
    for (const dir of possiblePaths) {
      if (fs.existsSync(dir)) {
        blogDir = dir;
        console.log(`Found blog directory at: ${blogDir}`);
        break;
      }
    }
    
    if (!blogDir) {
      console.error('Could not locate blog directory in Vercel environment.');
      console.log('Skipping blog sync in Vercel environment...');
      return;
    }
  } else {
    // Local development environment
    const rootDir = process.cwd();
    const landingDir = path.resolve(rootDir, '../landing');
    blogDir = path.resolve(landingDir, 'src/content/blog');
    
    if (!fs.existsSync(blogDir)) {
      console.error(`Blog directory not found at ${blogDir}`);
      console.log('Skipping blog sync...');
      return;
    }
    
    console.log(`Found blog directory at: ${blogDir}`);
  }
  
  try {
    console.log('Environment check:');
    console.log(`- NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Not set'}`);
    console.log(`- SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Not set'}`);
    
    const shouldForceSync = forceSync;
    if (shouldForceSync) {
      console.log('Forcing full sync of all blog posts...');
    }
    
    const syncCount = await syncAllBlogPosts(blogDir, shouldForceSync);
    console.log(`✅ Build-time sync completed. Successfully synced ${syncCount} blog posts.`);
  } catch (error) {
    console.error('❌ Error during blog sync:', error);
    console.log('Continuing build process despite sync error...');
  }
}

// Execute main function
main().catch(err => {
  console.error('Unhandled error in prebuild-sync-blog script:', err);
}); 