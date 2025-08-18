import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

/**
 * Schema for the Twitter Profile scoring result with category scores.
 */
export const profileScoreSchema = z.object({
    profileCompleteness: z.number().min(0).describe("Score for Profile Completeness & Clarity (0-15)."),
    relevance: z.number().min(0).describe("Score for Relevance to Web3 or AI (0-15)."),
    accountActivity: z.number().min(0).describe("Score for Account Activity (0-20)."),
    influence: z.number().min(0).describe("Score for Influence & Reach (0-15)."),
    contentQuality: z.number().min(0).describe("Score for Content Quality & Engagement (0-35)."),
    reasoning: z.string().describe("A brief explanation of why these scores were given, based on the profile criteria."),
    summary: z.string().describe("A concise summary of the profile and its content, highlighting key aspects and focus areas.")
});

/**
 * Type definition for the Twitter Profile scoring result.
 */
export type CategoryProfileScoreResult = z.infer<typeof profileScoreSchema>;

/**
 * Returns the legacy ProfileScoreResult format for backward compatibility
 */
export type ProfileScoreResult = {
    score: number;
    reasoning: string;
    summary: string;
};

/**
 * Scores a Twitter Profile based on provided data and predefined criteria using an AI model.
 *
 * @param profileData The JSON data object of the Twitter profile to be scored.
 *                      This should include information like description, follower count,
 *                      following count, tweet count, recent tweets (if available), etc.
 * @returns A promise that resolves to an object containing detailed category scores and reasoning.
 * @throws Throws an error if the AI model fails to generate the score object.
 */
export async function getProfileScore(profileData: object): Promise<ProfileScoreResult> {

    // --- Profile Scoring Criteria (0-100 points) ---
    const scoringCriteria = `
    1.  **Profile Completeness & Clarity (0-15 points):**
        - Bio/Description: Informative and clear? (0-7 points)
        - Profile Picture & Header: Appropriate, professional/on-topic? (0-5 points)
        - Location/Link: Provided and relevant? (0-3 points)
    2.  **Relevance to Web3 or AI (0-15 points):**
        - Bio/Description Keywords: Explicitly mentions relevant topics (Web3, AI, Blockchain, DeFi, ML, specific technologies)? (0-8 points)
        - Recent Tweet Content (if provided): Consistent discussion or engagement with relevant topics? (0-5 points)
        - Overall Focus: Profile clearly centers around relevant themes? (0-2 points)
    3.  **Account Activity (0-20 points):**
        - Tweet Frequency: Active posting schedule (relative to account age)? (0-10 points)
        - Follower/Following Ratio: Healthy ratio (e.g., not excessively following)? (0-5 points)
        - Account Age & Consistency: Established account with consistent activity? (0-5 points)
    4.  **Influence & Reach (0-15 points):**
        - Follower Count: Scale (e.g., <1k, 1k-10k, 10k+)? (Consider quality over quantity). (0-7 points)
        - Tweet View Count: Average views on recent tweets (0-3 points)
        - Verified Status: Twitter verified account? (0-5 points)
    5.  **Content Quality & Engagement (0-35 points):**
        - Recent Tweet Quality (if provided): Well-written, informative, non-spammy? Professional, relevant, and valuable to the community (0-20 points)
        - Engagement Metrics: Likes, retweets, replies, and overall interaction rate on tweets (0-10 points)
        - Originality & Uniqueness: Shares original thoughts, analysis, or insights rather than just retweeting others? (0-5 points)

    The total score is the sum of points from these criteria (max 100). Focus on evaluating both relevance to Web3/AI ecosystems and overall content quality.
    `;
    // --- End of Profile Scoring Criteria Definition ---

    try {
        // Note: Profile data can be large. Ensure only relevant parts are sent.
        // Consider summarizing recent tweets if including them.
        const { object: scoreResult } = await generateObject({
            model: openai('gpt-4o-mini'),
            schema: profileScoreSchema,
            prompt: `Your primary goal is to objectively analyze the provided Twitter profile data and score it against the given criteria. **For the \`summary\` field, your focus is to synthesize an understanding of \`exampleUser\`'s (using their actual username) persona, interests, and content style based PREDOMINANTLY on their recent tweets and interaction patterns, rather than just their static profile description (bio, location etc.).**
            
            Please analyze and score the following Twitter profile based *strictly* on the provided criteria. 
            Evaluate based *only* on the information provided.

            **Scoring Criteria:**
            ${scoringCriteria}

            **Twitter Profile Data (JSON):**
            \`\`\`json
            ${JSON.stringify(profileData, null, 2)}
            \`\`\`

            **IMPORTANT SCORING RULES**:
            1. If certain information is not provided at all (such as recent tweets, engagement metrics, etc.), you MUST assign a score of 0 for those specific criteria.
            2. If information is partially provided or incomplete, you must deduct points proportionally to how much is missing.
            3. Be consistent in your scoring - the same profile should receive similar scores across multiple evaluations.
            4. In your reasoning, explicitly mention what information was missing or incomplete and how that affected your scoring.

            For your output, you MUST provide a JSON object matching the defined schema. This object will contain:
            1. profileCompleteness: A number representing the total points for Profile Completeness & Clarity (0-15).
            2. relevance: A number representing the total points for Relevance to Web3 or AI (0-15).
            3. accountActivity: A number representing the total points for Account Activity (0-20).
            4. influence: A number representing the total points for Influence & Reach (0-15).
            5. contentQuality: A number representing the total points for Content Quality & Engagement (0-35).
            6. reasoning: A string containing a detailed explanation of why these numeric scores were given.
            7. summary: Generate a concise, synthesized intelligence brief about \`exampleUser\`'s (using their actual username) Twitter persona, inferred from their activities, discussion patterns, and content. This summary should provide insights that go beyond simply re-stating information directly available in their profile fields (like bio, location, or listed website).
               **GUIDELINES FOR THE SUMMARY SECTION**:
               a. **Username Usage**: You MUST refer to the profile owner *exclusively* by their actual \`username\` (e.g., 'exampleUser') throughout the entire summary. Do NOT use generic pronouns like 'the user', 'they', 'their', 'he', 'she', etc. Instead, consistently use the specific \`username\` (this is the value of the "username" key in the **Twitter Profile Data (JSON)** provided above). For instance, if the username is 'exampleUser', example phrases are "exampleUser\'s profile indicates..." or "exampleUser frequently discusses...".
               b. **Focus on Inferred Insights, Not Just Listed Facts**: The summary's primary goal is to describe \`exampleUser\` (using the actual username) by *synthesizing insights* from their overall profile data, especially their tweet content and interaction patterns. **Crucially, do NOT simply reiterate information that is plainly stated in their bio, description, or other static profile fields.** For example, instead of stating 'exampleUser\'s bio says they are a founder', focus on what their *tweets and activity* reveal about their interests, expertise, or the topics they frequently discuss. If their bio mentions 'founder of X' and their tweets are *all about* building X, then it's relevant to connect these. But if their tweets are about something else entirely, the summary should reflect their tweeted topics.
               c. **Highlighting Synthesized Observable Details**:
                  - Identify and highlight \`exampleUser\`'s (using the actual username) observable topics of interest, even if these are not explicitly related to Web3 or AI. (e.g., "exampleUser seems interested in [topic based on tweets/interactions]").
                  - Describe \`exampleUser\`'s (using the actual username) content style if it\'s discernible from the data. (e.g., "exampleUser\'s content is mainly conversational," or "exampleUser often shares links to external articles.").
                  - Infer and describe \`exampleUser\`'s (using the actual username) primary areas of expertise or focus based on the *preponderance, depth, and nature* of their discussions and shared content. What do they seem most knowledgeable or passionate about, judging by their Twitter activity?
               d. **Strictly Observable Information**: **Crucially, do NOT list missing information.** Do not say things like "exampleUser lacks a bio" or "there\'s no mention of X in exampleUser\'s profile." Instead, focus strictly on what *is* observable.
               e. **Handling Sparse Profiles**: If \`exampleUser\`'s (using the actual username) profile is very sparse, describe its observable state factually. (e.g., "exampleUser\'s profile is sparsely populated. exampleUser has a standard avatar, shows activity since [date], and exampleUser\'s primary Twitter usage is for [observed activity like \'replies\' or \'retweets\'.]").
               f. **Objective**: The summary should offer an understanding of \`exampleUser\`'s (using the actual username) current digital footprint, however minimal it might be, based *only* on positive or neutral observable facts.

            **CRITICAL**:
            1. The numeric scores (profileCompleteness, relevance, accountActivity, influence, contentQuality) in the JSON object are the definitive scores. Your reasoning string must accurately reflect and justify these exact numeric scores.
            2. **Be highly discerning in your scoring.** A perfect score or zero score in any category, or a total perfect score, should be **extremely rare** and reserved **only** for profiles that are truly exceptional and flawless in that category. Avoid awarding maximum points too readily; actively look for any aspect, however minor, that could be improved or is not absolutely top-tier before awarding a perfect score. If a profile is merely "very good" but not "exceptional and flawless," it should not receive a perfect score.
            
            In your reasoning, you MUST include for each category:
            - The specific score assigned (e.g., "Profile Completeness & Clarity (12/15)"), ensuring this matches the numeric value in the JSON.
            - What information was present and what was missing
            - How you calculated the score based on subcriteria
            - Any deductions made due to missing or incomplete information
            `
        });
            
        // Calculate the total score
        const totalScore = Math.min(
            scoreResult.profileCompleteness +
            scoreResult.relevance +
            scoreResult.accountActivity +
            scoreResult.influence +
            scoreResult.contentQuality,
            100
        );
        
        console.log(JSON.stringify({
            type: 'PROFILE_SCORE_DEBUG',
            event: 'score_calculation',
            data: {
                individualScores: {
                    profileCompleteness: scoreResult.profileCompleteness,
                    relevance: scoreResult.relevance,
                    accountActivity: scoreResult.accountActivity,
                    influence: scoreResult.influence,
                    contentQuality: scoreResult.contentQuality
                },
                totalScore,
                rawSum: scoreResult.profileCompleteness +
                    scoreResult.relevance +
                    scoreResult.accountActivity +
                    scoreResult.influence +
                    scoreResult.contentQuality
            }
        }));

        return {
            score: totalScore,
            reasoning: scoreResult.reasoning,
            summary: scoreResult.summary
        };

    } catch (error) {
        console.error("Error generating profile score:", error);
        throw new Error(`Failed to get profile score from AI model: ${error instanceof Error ? error.message : String(error)}`);
    }
}
