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
    'User-Agent': 'SecondBrain-API',
    'Access-Control-Allow-Origin': '*', // 혹은 특정 도메인
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  
  
  const data = await res.json()
  // GitHub API는 내용을 Base64로 전달하므로 원래 문자열로 디코딩
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  
  return c.json({ content, sha: data.sha })
})

// [R] 전체 목록 읽기 (GET /api/data)
app.get('/api/data', async (c) => {
  // 특정 파일명이 아니라 'data' 폴더 경로만 넘깁니다.
  const res = await githubRequest(c.env, 'GET', 'data')
  
  if (!res.ok) {
    // 폴더가 아예 없거나 권한 문제일 경우
    return c.json({ error: '목록을 불러올 수 없습니다.' }, res.status as any)
  }
  
  const files = await res.json()
  
  // 깃허브가 준 전체 정보 중 필요한 것만 골라서 깔끔하게 가공합니다.
  const fileList = files
    .filter(file => file.name.endsWith('.md')) // 마크다운 파일만 필터링
    .map(file => ({
      name: file.name,
      title: file.name.replace('.md', ''), // 확장자 제거한 제목
      sha: file.sha,
      size: file.size,
      download_url: file.download_url
    }))
  
  return c.json(fileList)
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