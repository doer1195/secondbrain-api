import { Hono } from 'hono'
import { Buffer } from 'node:buffer'
import { url } from 'node:inspector'

const app = new Hono()

// GitHub API 공통 호출 함수
const githubRequest = async (env, method, path, body = null) => {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`
  const headers = {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'SecondBrain-API' // GitHub API는 User-Agent를 필수로 요구함
  }
  
  const options = { method, headers }
  if (body) {
    options.body = JSON.stringify(body)
  }

  return fetch(url, options)
}

// 파일의 SHA 해시값 가져오기 (수정/삭제 시 필수)
const getFileSha = async (env, path) => {
  const res = await githubRequest(env, 'GET', path)
  if (res.ok) {
    const data = await res.json()
    return data.sha
  }
  return null
}

// [R] 읽기 (GET /api/data/파일명)
app.get('/api/data/:filename', async (c) => {
  const filename = c.req.param('filename')
  const res = await githubRequest(c.env, 'GET', `data/${filename}.md`)
  console.log(res)
  
  if (!res.ok) return c.json({ error: 'Not found' }, 404)
  
  const data = await res.json()
  // GitHub API는 내용을 Base64로 전달하므로 원래 문자열로 디코딩
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  
  return c.json({ content, sha: data.sha })
})

// [C] 생성 (POST /api/data/파일명)
app.post('/api/data/:filename', async (c) => {
  const filename = c.req.param('filename')
  const { content } = await c.req.json()
  
  // 한글 처리를 위해 완벽하게 Base64로 인코딩
  const encodedContent = Buffer.from(content, 'utf-8').toString('base64')

  const body = {
    message: `Create ${filename}.md`,
    content: encodedContent
  }

  const res = await githubRequest(c.env, 'PUT', `data/${filename}.md`, body) // 생성도 PUT 메서드 사용
  if (res.ok) return c.json({ success: true }, 201)
  return c.json({ error: 'Failed to create' }, res.status)
})

// [U] 수정 (PUT /api/data/파일명)
app.put('/api/data/:filename', async (c) => {
  const filename = c.req.param('filename')
  const { content } = await c.req.json()
  const path = `data/${filename}.md`
  
  // 1. 기존 파일의 SHA값 조회
  const sha = await getFileSha(c.env, path)
  if (!sha) return c.json({ error: 'File not found' }, 404)

  // 2. 새로운 내용으로 덮어쓰기 업데이트
  const encodedContent = Buffer.from(content, 'utf-8').toString('base64')
  const body = {
    message: `Update ${filename}.md`,
    content: encodedContent,
    sha: sha // 수정할 때는 기존 파일의 SHA 값이 필수
  }

  const res = await githubRequest(c.env, 'PUT', path, body)
  if (res.ok) return c.json({ success: true })
  return c.json({ error: 'Failed to update' }, res.status as any)
})

// [D] 삭제 (DELETE /api/data/파일명)
app.delete('/api/data/:filename', async (c) => {
  const filename = c.req.param('filename')
  const path = `data/${filename}.md`
  
  // 1. 삭제할 파일의 SHA값 조회
  const sha = await getFileSha(c.env, path)
  if (!sha) return c.json({ error: 'File not found' }, 404)

  // 2. 삭제 요청
  const body = {
    message: `Delete ${filename}.md`,
    sha: sha // 삭제할 때도 SHA 값이 필수
  }

  const res = await githubRequest(c.env, 'DELETE', path, body)
if (res.ok) return c.json({ success: true })
  return c.json({ error: 'Failed to delete' }, res.status as any)
})

export default app