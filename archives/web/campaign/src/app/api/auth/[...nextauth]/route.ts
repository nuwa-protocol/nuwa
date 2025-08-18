// https://next-auth.js.org/configuration/nextjs#app-directory

import NextAuth from "next-auth"
import { authOptions } from "@/auth"

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }